/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:56:58
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-17 13:50:14
 */
import { NextHandleFunction } from "connect";
import { ServerContext } from "../";
import path from "path";
import { pathExists, readFile } from "fs-extra";

export function indexHtmlMiddware(
    serverContext: ServerContext
): NextHandleFunction {
    return async (req, res, next) => {
        if (req.url === "/") {
            const { root } = serverContext;
            // 获取index.html
            const indexHtmlPath = path.join(root, "index.html");
            if (await pathExists(indexHtmlPath)) {
                const rawHtml = await readFile(indexHtmlPath, "utf8");
                let html = rawHtml;
                // 执行插件的transformIndexHtml方法来对对HTML进行自定义修改
                // for (const plugin of serverContext.plugins) {
                // if (plugin.transformIndexHtml) {
                html = await serverContext.transformIndexHtml(html);
                // }
                // }
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                return res.end(html);
            }
        }
        return next();
    };
}