/*
 * @Author: Zhouqi
 * @Date: 2023-05-23 13:48:05
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 17:02:45
 */
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

const doTransform = async (
    url: string,
    server: ServerContext,
) => {
    const { pluginContainer, config } = server;
    const id = (await pluginContainer.resolveId(url))?.id || url;
    const transformResult = loadAndTransform(id, url, server);
    // 处理运行过程中发现的的依赖
    getDepsOptimizer(config)?.delayDepsOptimizerUntil(id, () => transformResult);
    return transformResult
};

const loadAndTransform = async (
    id: string,
    url: string,
    server: ServerContext,
) => {
    const { pluginContainer, moduleGraph, config } = server;
    url = cleanUrl(url);
    // 查找缓存的模块
    let mod = await moduleGraph.getModuleByUrl(url);
    if (mod && mod.transformResult) {
        return mod.transformResult;
    }
    // 依次调用插件容器的 resolveId、load、transform 方法
    const resolvedResult = await pluginContainer.resolveId(url);
    let transformResult;
    if (resolvedResult?.id) {
        let code = await pluginContainer.load(resolvedResult.id);
        if (typeof code === "object" && code !== null) {
            code = code.code;
        }
        const { moduleGraph } = server;
        mod = await moduleGraph.ensureEntryFromUrl(url);
        if (code) {
            transformResult = await pluginContainer.transform(
                code as string,
                resolvedResult?.id
            );
        }
    }
    // 缓存模块
    if (mod) {
        mod.transformResult = transformResult;
    }
    return transformResult;
}
