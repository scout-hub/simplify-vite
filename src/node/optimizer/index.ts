/*
 * @Author: Zhouqi
 * @Date: 2023-05-16 14:06:38
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-17 13:22:34
 */
import path from "node:path";
import fs from "node:fs";
import { ResolvedConfig } from "../config";
import { emptyDir, normalizePath, writeFile } from "../utils";
import { build } from "esbuild";
import { ESBUILD_MODULES_TARGET } from "../constants";
import { esbuildDepPlugin } from "./esbuildDepPlugin";

export type OptimizeDeps = {
    entries: string[];
}

/**
 * @author: Zhouqi
 * @description: 执行预构建依赖
 */
export const runOptimizeDeps = async (
    resolvedConfig: ResolvedConfig,
    depsInfo: Record<string, any>,
) => {
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
    const flatIdDeps = Object.keys(depsInfo);
    const plugins = []
    plugins.push(esbuildDepPlugin(depsInfo));
    const result = await build({
        entryPoints: flatIdDeps,
        bundle: true,
        format: 'esm',
        // build的时候会从config.build.target中获取，dev模式下用vite内部定义的值
        target: ESBUILD_MODULES_TARGET,
        sourcemap: true,
        outdir: processingCacheDir,
        plugins
    });
    // console.log(depsInfo);
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