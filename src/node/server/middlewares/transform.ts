/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 14:37:23
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 19:11:09
 */
import { NextHandleFunction } from "connect";
import {
    isJSRequest,
    isCSSRequest,
    isImportRequest
} from "../../utils";
import { ServerContext } from "../index";
import { transformRequest } from "../transformRequest";

export function transformMiddleware(
    serverContext: ServerContext
): NextHandleFunction {
    return async (req, res, next) => {
        if (req.method !== "GET" || !req.url) {
            return next();
        }
        const url = req.url;
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