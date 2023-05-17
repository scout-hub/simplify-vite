/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-16 21:19:02
 */
import path from "path";
import { build } from "esbuild";
import { green } from "picocolors";
import { scanImports, scanPlugin } from "./scan";
import { preBundlePlugin } from "./esbuildDepPlugin";
import { PRE_BUNDLE_DIR } from "../constants";
import { runOptimizeDeps } from '.'
import { ResolvedConfig } from "../config";

export const optimize = async (root: string) => {
    // 1. 这里暂定入口为src/main.tsx
    const entry = path.resolve(root, "src/main.tsx");
    // 2. 从入口处扫描依赖，获取需要与构建的依赖
    const deps = new Set<string>();
    await build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        plugins: [scanPlugin(deps)],
    });
    console.log(
        `${green("需要预构建的依赖")}:\n${[...deps]
            .map(green)
            .map((item) => `  ${item}`)
            .join("\n")}`
    );
    // 3. 预构建依赖
    await build({
        entryPoints: [...deps],
        write: true,
        bundle: true,
        format: "esm",
        splitting: true,
        outdir: path.resolve(root, PRE_BUNDLE_DIR),
        plugins: [preBundlePlugin(deps)],
    });
}

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

/**
 * @author: Zhouqi
 * @description: 创建预构建依赖分析
 */
const createDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    const deps = await discoverProjectDependencies(config);
    const postScanOptimizationResult = runOptimizeDeps(config, deps);
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

