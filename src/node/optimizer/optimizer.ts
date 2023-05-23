/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-22 15:35:07
 */
import path from "node:path";
import fs from "node:fs"
// import { build } from "esbuild";
// import { green } from "picocolors";
import { scanImports } from "./scan";
// import { preBundlePlugin } from "./esbuildDepPlugin";
// import { PRE_BUNDLE_DIR } from "../constants";
import {
    DepOptimizationMetadata,
    getDepsCacheDir,
    initDepsOptimizerMetadata,
    runOptimizeDeps,
    getOptimizedDepPath,
    addOptimizedDepInfo,
    extractExportsData,
    DepsOptimizer,
    OptimizedDepInfo
} from '.'
import { ResolvedConfig } from "../config";
import { emptyDir } from "../utils";

/**
 * @author: Zhouqi
 * @description: 初始化依赖分析
 */
export const initDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    createDepsOptimizer(config, server);
};

const depsOptimizerMap = new WeakMap<ResolvedConfig, DepsOptimizer>();

/**
 * @author: Zhouqi
 * @description: 创建预构建依赖分析
 */
const createDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    // 读取缓存的metadata json文件
    const cachedMetadata = loadCachedDepOptimizationMetadata(config);
    // 创建metadata对象，缓存预构建依赖的信息
    let metadata = cachedMetadata || initDepsOptimizerMetadata(config);
    
    const depsOptimizer = {
        metadata,
        getOptimizedDepId: (depInfo: OptimizedDepInfo) => `${depInfo.file}`,
    };

    // 将预构建依赖分析对象存入map中
    depsOptimizerMap.set(config, depsOptimizer);

    // 是否是第一次预构建，不存在缓存的metadata
    if (!cachedMetadata) {
        // todo 开发模式下才需要扫描依赖
        const deps = await discoverProjectDependencies(config);
        for (const id of Object.keys(deps)) {
            if (!metadata.discovered[id]) {
                addMissingDep(id, deps[id]);
            }
        }
        // console.log('metadata');
        const postScanOptimizationResult = runOptimizeDeps(config, deps);
    }

    // 添加缺失的依赖信息
    function addMissingDep(id: string, resolved: string) {
        return addOptimizedDepInfo(metadata, 'discovered', {
            id,
            file: getOptimizedDepPath(id, config),
            src: resolved,
            exportsData: extractExportsData(resolved, config),
        });
    }
}

/**
 * @author: Zhouqi
 * @description: 查找预构建依赖
 */
const discoverProjectDependencies = async (config: Record<string, any>) => {
    // 根据import进行依赖分析，找出需要预构建的资源
    const { deps } = await scanImports(config);
    return deps;
}

/**
 * @author: Zhouqi
 * @description: 获取缓存的预构建依赖信息
 */
const loadCachedDepOptimizationMetadata = (config: ResolvedConfig): DepOptimizationMetadata | undefined => {
    // 缓存目录存在则清空
    if (fs.existsSync(path.join(config.cacheDir, '_metadata.json'))) {
        emptyDir(config.cacheDir);
    }
    // 获取缓存目录
    const depsCacheDir = getDepsCacheDir(config);
    let cachedMetadata;
    try {
        // 定义缓存地址
        const cachedMetadataPath = path.join(depsCacheDir, '_metadata.json');
        const metaData = fs.readFileSync(cachedMetadataPath, 'utf-8');
        // cachedMetadata = parseDepsOptimizerMetadata(fs.readFileSync(cachedMetadataPath, 'utf-8'), depsCacheDir);
    }
    catch (e) {
        // 没有获取到缓存的metadata
    }
    return cachedMetadata;
};

/**
 * @author: Zhouqi
 * @description: 根据config配置获取预构建依赖分析对象
 */
export const getDepsOptimizer = (
    config: ResolvedConfig,
): DepsOptimizer | undefined => depsOptimizerMap.get(config,)


