/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 14:37:23
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-21 16:49:37
 */
import { NextHandleFunction } from "connect";
import {
    isJSRequest,
    cleanUrl,
    isCSSRequest,
    isImportRequest
} from "../../utils";
import { ServerContext } from "../index";
import createDebug from "debug";

const debug = createDebug("dev");

export async function transformRequest(
    url: string,
    serverContext: ServerContext
) {
    const { pluginContainer, moduleGraph } = serverContext;
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
        const { moduleGraph } = serverContext;
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

export function transformMiddleware(
    serverContext: ServerContext
): NextHandleFunction {
    return async (req, res, next) => {
        if (req.method !== "GET" || !req.url) {
            return next();
        }
        const url = req.url;
        debug("transformMiddleware: %s", url);
        // transform JS request
        if (isJSRequest(url) || isCSSRequest(url) || isImportRequest(url)) {
            // 核心编译函数
            let result = await transformRequest(url, serverContext);
            if (!result) {
                return next();
            }
            if (result && typeof result !== "string") {
                result = result.code;
            }
            // 编译完成，返回响应给浏览器
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/javascript");
            return res.end(result);
        }

        next();
    };
}