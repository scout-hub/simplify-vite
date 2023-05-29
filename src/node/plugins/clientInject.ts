/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:34:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 11:58:48
 */
import { CLIENT_PUBLIC_PATH, HMR_PORT } from "../constants";
import { Plugin } from "../plugin";
import fs from "fs-extra";
import path from "path";
import { ServerContext } from "../server/index";

export function clientInjectPlugin(): Plugin {
    let serverContext: ServerContext;
    return {
        name: "m-vite:client-inject",
        configureServer(s) {
            serverContext = s;
        },
        resolveId(id) {
            if (id === CLIENT_PUBLIC_PATH) {
                return { id };
            }
            return null;
        },
        async load(id) {
            // 加载 HMR 客户端脚本
            if (id === CLIENT_PUBLIC_PATH) {
                const realPath = path.join(
                    serverContext.root,
                    "node_modules",
                    "simplify-vite",
                    "dist",
                    "client.mjs"
                );
                const code = await fs.readFile(realPath, "utf-8");
                return {
                    // 替换占位符
                    code: code.replace("__HMR_PORT__", JSON.stringify(HMR_PORT)),
                };
            }
        }
    };
}