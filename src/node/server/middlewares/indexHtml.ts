/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:56:58
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 19:11:04
 */
import path from "path";
import fs from "fs";
import { NextHandleFunction } from "connect";
import { ServerContext } from "../";
import { normalizePath } from "../../utils";
import { applyHtmlTransforms } from "../../plugins/html";

/**
 * @author: Zhouqi
 * @description: 获取index页面
 */
const getHtmlFilename = (url: string, server: ServerContext) => {
    return decodeURIComponent(normalizePath(path.join(server.config.root, url.slice(1))));
}

/**
 * @author: Zhouqi
 * @description: 创建解析html文件的函数
 */
export const createDevHtmlTransformFn = (server: ServerContext) => {
    return (url: string, html: string, originalUrl: string): Promise<string> => {
        return applyHtmlTransforms(html);
    }
}

/**
 * @author: Zhouqi
 * @description: 处理html的中间件
 */
export function indexHtmlMiddware(
    serverContext: ServerContext
): NextHandleFunction {
    return async (req, res, next) => {
        const url = req.url;
        if (url === "/") {
            const filename = getHtmlFilename(url, serverContext) + "/index.html";
            // 判断文件是否存在
            if (fs.existsSync(filename)) {
                let html = fs.readFileSync(filename, 'utf-8');
                // 调用html解析函数
                html = await serverContext.transformIndexHtml(url, html, req.originalUrl);
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html");
                return res.end(html);
            }
        }
        return next();
    };
}