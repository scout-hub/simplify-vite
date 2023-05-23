/*
 * @Author: Zhouqi
 * @Date: 2023-05-16 14:06:38
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 22:05:48
 */
import path from "node:path";
import fs from "node:fs";
import { ResolvedConfig } from "../config";
import {
    emptyDir,
    flattenId,
    normalizePath,
    removeDir,
    renameDir,
    writeFile,
} from "../utils";
import { build } from "esbuild";
import { ESBUILD_MODULES_TARGET } from "../constants";
import { esbuildDepPlugin } from "./esbuildDepPlugin";

export type OptimizeDeps = {
    entries: string[];
}

export interface OptimizedDepInfo {
    id: string
    file: string
    src?: string
    needsInterop?: boolean
    browserHash?: string
    fileHash?: string
    /**
     * 在优化过程中，ids 仍然可以解析到它们的最终位置，但是 bundle 可能还没有保存到磁盘
     */
    processing?: Promise<void>
    /**
     * ExportData 缓存，发现 deps 将解析 src 条目以获取导出数据，用于定义是否需要互操作以及何时进行预捆绑
     */
    exportsData?: Promise<Record<string, any>>
}

export interface DepOptimizationMetadata {
    /**
     * 主哈希值由用户配置和依赖锁文件决定。这会在服务器启动时进行检查，以避免不必要的重新捆绑。
     */
    // hash: string
    /**
     * 浏览器哈希由主哈希加上运行时发现的附加依赖项决定。这用于使浏览器对优化的 deps 的请求无效
     */
    // browserHash: string
    /**
     * Metadata for each already optimized dependency
     */
    optimized: Record<string, OptimizedDepInfo>
    /**
     * Metadata for non-entry optimized chunks and dynamic imports
     */
    chunks: Record<string, OptimizedDepInfo>
    /**
     * Metadata for each newly discovered dependency after processing
     */
    discovered: Record<string, OptimizedDepInfo>
    /**
     * OptimizedDepInfo list
     */
    depInfoList: OptimizedDepInfo[]
}

export interface DepsOptimizer {
    metadata: DepOptimizationMetadata,
    getOptimizedDepId: (depInfo: OptimizedDepInfo) => string,
    delayDepsOptimizerUntil: (id: string, done: () => Promise<any>) => void,
    isOptimizedDepUrl: (url: string) => boolean
    isOptimizedDepFile: (id: string) => boolean
    scanProcessing?: Promise<void>,
}

/**
 * @author: Zhouqi
 * @description: 执行预构建依赖
 */
export const runOptimizeDeps = async (
    resolvedConfig: ResolvedConfig,
    depsInfo: Record<string, any>,
) => {
    const config: ResolvedConfig = {
        ...resolvedConfig,
    }
    // 获取预构建依赖需要输出的目录
    const depsCacheDir = getDepsCacheDir(resolvedConfig);
    // 获取运行时的预构建依赖输出目录
    const processingCacheDir = getProcessingDepsCacheDir(resolvedConfig);
    /**
     * 创建一个临时目录，这样我们就不需要删除优化的deps，直到它们被处理。
     * 如果出现错误，这也可以避免使 deps 缓存目录处于损坏状态
     */
    fs.existsSync(processingCacheDir) ?
        emptyDir(processingCacheDir) :
        fs.mkdirSync(processingCacheDir, { recursive: true });

    // 缓存目录中的所有文件都应被识别为 ES 模块
    writeFile(path.resolve(processingCacheDir, 'package.json'), JSON.stringify({ type: 'module' }));

    const metadata: DepOptimizationMetadata = initDepsOptimizerMetadata(config);

    // 没有预构建的依赖，直接返回
    const qualifiedIds = Object.keys(depsInfo);
    if (!qualifiedIds.length) return;

    const processingResult = {
        metadata,
        async commit() {
            // 写入元数据文件，删除 `deps` 文件夹并将 `processing` 文件夹重命名为 `deps` 处理完成，
            // 我们现在可以用 depsCacheDir 替换 processingCacheDir 将文件路径从临时处理目录重新连接到最终的 deps 缓存目录
            await removeDir(depsCacheDir);
            await renameDir(processingCacheDir, depsCacheDir);
        },
        cancel() {
            fs.rmSync(processingCacheDir, { recursive: true, force: true })
        }
    };

    /**
     * esbuild 生成具有最低公共祖先基础的嵌套目录输出，这是不可预测的，并且难以分析条目/输出映射。
     * 所以我们在这里做的是：
     * 1. 压平所有的ids来消除斜杠  例如react-dom/client在内部会被记录为react-dom_client
     * 2. 在插件中，我们自己读取条目作为虚拟文件来保留路径。
     */
    const flatIdDeps: Record<string, string> = {};
    const plugins = [];
    for (const id in depsInfo) {
        const src = depsInfo[id].src;
        const flatId = flattenId(id);
        flatIdDeps[flatId] = src;
    }
    plugins.push(esbuildDepPlugin(flatIdDeps, resolvedConfig));
    await build({
        entryPoints: Object.keys(flatIdDeps),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        // build的时候会从config.build.target中获取，dev模式下用vite内部定义的值
        target: ESBUILD_MODULES_TARGET,
        splitting: true,
        sourcemap: true,
        outdir: processingCacheDir,
        plugins,
        supported: {
            'dynamic-import': true,
            'import-meta': true,
        },
    });
    for (const id in depsInfo) {
        const { exportsData, ...info } = depsInfo[id];
        // 将depsInfo中的信息添加到metadata的optimized中
        addOptimizedDepInfo(metadata, 'optimized', {
            ...info,
        });
    }
    const dataPath = path.join(processingCacheDir, '_metadata.json');
    writeFile(dataPath, stringifyDepsOptimizerMetadata(metadata, depsCacheDir));
    return processingResult;
};

const stringifyDepsOptimizerMetadata = (
    metadata: DepOptimizationMetadata,
    depsCacheDir: string,
) => {
    const { optimized, chunks } = metadata;
    return JSON.stringify(
        {
            optimized: Object.fromEntries(
                Object.values(optimized).map(
                    ({ id, src, file, fileHash, needsInterop }) => [
                        id,
                        {
                            src,
                            file,
                            fileHash,
                            needsInterop,
                        },
                    ],
                ),
            ),
            chunks: Object.fromEntries(
                Object.values(chunks).map(({ id, file }) => [id, { file }]),
            ),
        },
        // 路径可以是绝对路径或相对于 _metadata.json 所在的 deps 缓存目录
        (key: string, value: string) => key === 'file' || key === 'src' ? normalizePath(path.relative(depsCacheDir, value)) : value
        ,
        2
    );
}

/**
 * @author: Zhouqi
 * @description: 初始化预构建依赖元信息
 */
export const initDepsOptimizerMetadata = (
    config: ResolvedConfig,
    timestamp?: string,
): DepOptimizationMetadata => {
    // const hash = getDepHash(config)
    return {
        // hash,
        // browserHash: getOptimizedBrowserHash(hash, {}, timestamp),
        optimized: {},
        chunks: {},
        discovered: {},
        depInfoList: [],
    }
};

// 获取预构建依赖打包后输出的文件目录
export function getDepsCacheDir(config: ResolvedConfig): string {
    return getDepsCacheDirPrefix(config) + getDepsCacheSuffix(config);
}

/**
 * @author: Zhouqi
 * @description: 生成缓存前缀
 */
export function getDepsCacheDirPrefix(config: ResolvedConfig): string {
    return normalizePath(path.resolve(config.cacheDir, 'deps'))
}

/**
 * @author: Zhouqi
 * @description: 生成缓存后缀
 */
const getDepsCacheSuffix = (config: ResolvedConfig): string => {
    let suffix = ''
    return suffix
}

/**
 * @author: Zhouqi
 * @description: 获取运行时的预构建缓存输出目录
 */
const getProcessingDepsCacheDir = (config: ResolvedConfig) => {
    return (getDepsCacheDirPrefix(config) + getDepsCacheSuffix(config) + '_temp');
}

/**
 * @author: Zhouqi
 * @description: 获取预构建产物的路径
 */
export const getOptimizedDepPath = (
    id: string,
    config: ResolvedConfig,
): string => normalizePath(
    path.resolve(getDepsCacheDir(config), flattenId(id) + '.js'),
);

/**
 * @author: Zhouqi
 * @description: 提导出的数据
 */
export async function extractExportsData(resolved: string, config: ResolvedConfig) {
    const exportsData = {};
    return exportsData;
}

/**
 * @author: Zhouqi
 * @description: 添加优化依赖信息
 */
export const addOptimizedDepInfo = (
    metadata: DepOptimizationMetadata,
    type: 'optimized' | 'discovered' | 'chunks',
    depInfo: OptimizedDepInfo
) => {
    metadata[type][depInfo.id] = depInfo;
    metadata.depInfoList.push(depInfo);
    return depInfo;
}

/**
 * @author: Zhouqi
 * @description: 根据模块id路径获取优化依赖信息
 */
export const optimizedDepInfoFromId = (
    metadata: DepOptimizationMetadata,
    id: string,
): OptimizedDepInfo | undefined => metadata.optimized[id] || metadata.discovered[id] || metadata.chunks[id]

/**
 * @author: Zhouqi
 * @description: 是否为预构建优化依赖文件
 */
export const isOptimizedDepFile = (
    id: string,
    config: ResolvedConfig,
): boolean => {
    // console.log(id, getDepsCacheDirPrefix(config));
    return id.startsWith(getDepsCacheDirPrefix(config));
}

export const createIsOptimizedDepUrl = (
    config: ResolvedConfig,
): (url: string) => boolean => {
    const { root } = config
    const depsCacheDir = getDepsCacheDirPrefix(config)
    const depsCacheDirRelative = normalizePath(path.relative(root, depsCacheDir))
    const depsCacheDirPrefix = `/${depsCacheDirRelative}`;
    return function isOptimizedDepUrl(url: string): boolean {
        return url.startsWith(depsCacheDirPrefix)
    }
}

