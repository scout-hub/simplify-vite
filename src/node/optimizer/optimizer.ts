/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-15 16:19:24
 */
import path from "path";
import { build } from "esbuild";
import { green } from "picocolors";
import { scanPlugin } from "./scan";
import { preBundlePlugin } from "./preBundlePlugin";
import { PRE_BUNDLE_DIR } from "../constants";

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
    config: Record<string, any>,
    server?: Record<string, any>,
) => {
    console.log(1);
};