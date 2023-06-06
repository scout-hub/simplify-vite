/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 16:02:38
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-06 15:53:07
 */
import { Plugin } from "../plugin";
import { ServerContext } from "../server";
import { cleanUrl, getShortName, normalizePath, removeImportQuery } from "../utils";
import { ResolvedConfig } from "../config";

export function assetPlugin(config: ResolvedConfig): Plugin {
    let serverContext: ServerContext;
    return {
        name: "m-vite:asset",
        configureServer(s) {
            serverContext = s;
        },
        async load(id) {
            // 非静态资源类型直接返回
            if (!config.assetsInclude(cleanUrl(id))) return;
            const cleanedId = removeImportQuery(cleanUrl(id));
            const resolvedId = `${getShortName(normalizePath(cleanedId), serverContext.root)}`;
            // 这里仅处理 svg
            return {
                code: `export default "${resolvedId}"`,
            };
        },
    };
}