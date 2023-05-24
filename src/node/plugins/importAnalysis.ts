/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:10:19
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-24 16:42:39
 */
import { init, parse } from "es-module-lexer";
import {
    BARE_IMPORT_RE,
    CLIENT_PUBLIC_PATH,
    DEFAULT_EXTERSIONS,
    PRE_BUNDLE_DIR,
} from "../constants";
import {
    cleanUrl,
    isJSRequest,
    normalizePath,
    getShortName,
    isInternalRequest,
    transformStableResult
} from "../utils";
// magic-string 用来作字符串编辑
import MagicString from "magic-string";
import path from "path";
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";
import { pathExists } from "fs-extra";
import resolve from "resolve";
import { ResolvedConfig } from "../config";

export function importAnalysisPlugin(config: ResolvedConfig): Plugin {
    let serverContext: ServerContext;
    const { root } = config;
    return {
        name: "m-vite:import-analysis",
        configureServer(s) {
            // 保存服务端上下文
            serverContext = s;
        },
        async transform(code: string, importer: string) {
            // 只处理 JS 相关的请求
            if (!isJSRequest(importer) || isInternalRequest(importer)) {
                return null;
            }
            await init;
            // 解析 import 语句
            const [imports] = parse(code);
            const ms = new MagicString(code);
            let s: MagicString | undefined;
            const str = () => s || (s = new MagicString(code));
            const normalizeUrl = async (url: string, pos: number) => {
                const resolved = await this.resolve!(url, importer);
                if (!resolved) console.error('error');
                const id = resolved.id;
                if (id.startsWith(root + '/')) {
                    url = id.slice(root.length);
                }
                return [url, id];
            };
            const { moduleGraph } = serverContext;
            const curMod = moduleGraph.getModuleById(importer)!;
            const importedModules = new Set<string>();
            // 对每一个 import 语句依次进行分析
            for (const importInfo of imports) {
                let rewriteDone = false;
                let { s: modStart, e: modEnd, n: specifier } = importInfo;
                if (!specifier) continue;
                const [url, resolvedId] = await normalizeUrl(specifier, modStart);
                // 静态资源
                if (specifier.endsWith(".svg")) {
                    // 加上 ?import 后缀
                    const resolvedUrl = path.join(path.dirname(importer), specifier);
                    ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`);
                    continue;
                }
                // 第三方库: 路径重写到预构建产物的路径
                if (BARE_IMPORT_RE.test(specifier)) {
                    ms.overwrite(modStart, modEnd, url);
                    importedModules.add(url);
                }
                if (!rewriteDone) {
                    str().overwrite(modStart, modEnd, url, {
                        contentOnly: true,
                    });
                }
            }
            // 只对业务源码注入
            // if (!id.includes("node_modules")) {
            //     // 注入 HMR 相关的工具函数
            //     ms.prepend(
            //         `import { createHotContext as __vite__createHotContext } from "${CLIENT_PUBLIC_PATH}";
            //         import.meta.hot = __vite__createHotContext(${JSON.stringify(cleanUrl(curMod.url))});`
            //     );
            // }
            if (s) return transformStableResult(s);
            return {
                code: ms.toString(),
                // 生成 SourceMap
                map: ms.generateMap(),
            };
        },
    };
}