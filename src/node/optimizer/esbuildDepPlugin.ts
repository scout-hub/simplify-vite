/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:48:11
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-17 13:22:37
 */
import { Loader, Plugin } from "esbuild";
import { BARE_IMPORT_RE } from "../constants";
// 用来分析 es 模块 import/export 语句的库
import { init, parse } from "es-module-lexer";
import path from "path";
import resolve from "resolve";
import fs from "fs-extra";
// 用来开发打印 debug 日志的库
import { normalizePath } from "../utils";
import { ResolvedConfig } from "../config";

export function preBundlePlugin(deps: Set<string>): Plugin {
    return {
        name: "esbuild:pre-bundle",
        setup(build) {
            build.onResolve(
                {
                    filter: BARE_IMPORT_RE,
                },
                (resolveInfo) => {
                    const { path: id, importer } = resolveInfo;
                    const isEntry = !importer;
                    // 命中需要预编译的依赖
                    if (deps.has(id)) {
                        // 若为入口，则标记 dep 的 namespace
                        return isEntry
                            ? {
                                path: id,
                                namespace: "dep",
                            }
                            : {
                                path: resolve.sync(id, { basedir: process.cwd() }),
                            };
                    }
                }
            );
            // 拿到标记后的依赖，构造代理模块，交给 esbuild 打包
            build.onLoad(
                {
                    filter: /.*/,
                    namespace: "dep",
                },
                async (loadInfo) => {
                    await init;
                    const id = loadInfo.path;
                    const root = process.cwd();
                    const entryPath = normalizePath(resolve.sync(id, { basedir: root }));
                    const code = await fs.readFile(entryPath, "utf-8");
                    const [imports, exports] = await parse(code);
                    let proxyModule = [];
                    // cjs
                    if (!imports.length && !exports.length) {
                        // 构造代理模块
                        const res = require(entryPath);
                        const specifiers = Object.keys(res);
                        proxyModule.push(
                            `export { ${specifiers.join(",")} } from "${entryPath}"`,
                            `export default require("${entryPath}")`
                        );
                    } else {
                        // esm 格式比较好处理，export * 或者 export default 即可
                        if (exports.includes("default" as any)) {
                            proxyModule.push(`import d from "${entryPath}";export default d`);
                        }
                        proxyModule.push(`export * from "${entryPath}"`);
                    }
                    const loader = path.extname(entryPath).slice(1);
                    return {
                        loader: loader as Loader,
                        contents: proxyModule.join("\n"),
                        resolveDir: root,
                    };
                }
            );
        },
    };
}

/**
 * @author: Zhouqi
 * @description: esbuild 预构建插件
 */
export function esbuildDepPlugin(
    qualified: Record<string, string>,
    // external: string[],
    // config: ResolvedConfig,
): Plugin {
    return {
        name: 'vite:dep-pre-bundle',
        setup(build) {
            build.onResolve(
                { filter: /^[\w@][^:]/ },
                async ({ path: id, importer, kind }: any) => {
                    // console.log(id);
                    return null;
                })
        }
    };
}