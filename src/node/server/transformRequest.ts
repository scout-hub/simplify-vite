/*
 * @Author: Zhouqi
 * @Date: 2023-05-23 13:48:05
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 18:57:18
 */
import { green } from "picocolors";
import type { ServerContext } from ".";
import { getDepsOptimizer } from "../optimizer/optimizer";
import { cleanUrl } from "../utils";

export async function transformRequest(
    url: string,
    serverContext: ServerContext
) {
    const transformResult = doTransform(url, serverContext);
    return transformResult;
}

/**
 * @author: Zhouqi
 * @description: 转换
 */
const doTransform = async (
    url: string,
    server: ServerContext,
) => {
    const { pluginContainer, config } = server;
    // 获取缓存的模块
    const module = await server.moduleGraph.getModuleByUrl(url);
    // 如果有缓存则直接返回缓存的结果
    const cached = module && module.transformResult;
    if (cached) {
        console.log(green(`[memory] ${url}`));
        return cached;
    }
    const id = (await pluginContainer.resolveId(url))?.id || url;
    const transformResult = loadAndTransform(id, url, server);
    // 处理运行过程中发现的的依赖
    getDepsOptimizer(config)?.delayDepsOptimizerUntil(id, () => transformResult);
    return transformResult
};

/**
 * @author: Zhouqi
 * @description: 加载并转化模块
 */
const loadAndTransform = async (
    id: string,
    url: string,
    server: ServerContext,
) => {
    const { pluginContainer, moduleGraph } = server;
    url = cleanUrl(url);
    let transformResult;
    let code = await pluginContainer.load(id);
    if (typeof code === "object" && code !== null) code = code.code;
    // 模块加载成功，则将模块更新到模块依赖图中
    const mod = await moduleGraph.ensureEntryFromUrl(url);
    if (code) {
        transformResult = await pluginContainer.transform(
            code as string,
            id
        );
    }
    // 缓存模块转换结果
    mod && (mod.transformResult = transformResult);
    return transformResult;
}
