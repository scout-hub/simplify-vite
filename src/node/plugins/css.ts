/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:50:31
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-09 11:18:18
 */
import { readFile } from "fs-extra";
import { CLIENT_PUBLIC_PATH, CSS_LANGS_RE } from "../constants";
import { Plugin } from "../plugin";
import { ServerContext } from "../server";
import { getShortName } from "../utils";

export function cssPlugin(): Plugin {
    let serverContext: ServerContext;
    return {
        name: "m-vite:css",
        configureServer(s) {
            serverContext = s;
        },
        load(id) {
            // 加载
            if (id.endsWith(".css")) {
                return readFile(id, "utf-8");
            }
        },
        // 转换逻辑
        transform(code, id) {
            if (id.endsWith(".css")) {
                // 包装成 JS 模块
                const jsContent = `
                    import { createHotContext as __vite__createHotContext } from "${CLIENT_PUBLIC_PATH}";
                    import.meta.hot = __vite__createHotContext("/${getShortName(id, serverContext.root)}");

                    import { updateStyle, removeStyle } from "${CLIENT_PUBLIC_PATH}"
                    
                    const id = '${id}';
                    const css = '${code.replace(/\n/g, "")}';

                    updateStyle(id, css);
                    import.meta.hot.accept();
                    export default css;
                    import.meta.hot.prune(() => removeStyle(id));`.trim();
                return {
                    code: jsContent,
                };
            }
            return null;
        },
    };
}

export const isDirectCSSRequest = (request: string): boolean => CSS_LANGS_RE.test(request) 