/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:10:19
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-12 19:26:23
 */
import type { ImportSpecifier } from 'es-module-lexer';
import { init, parse } from "es-module-lexer";
import {
    CLIENT_PUBLIC_PATH,
} from "../constants";
import {
    cleanUrl,
    isJSRequest,
    isInternalRequest,
    transformStableResult,
    isCSSRequest,
    isExternalUrl,
    stripBase
} from "../utils";
import { parse as parseJS } from 'acorn';
// magic-string 用来作字符串编辑
import MagicString from "magic-string";
import path from "path";
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";
import { ResolvedConfig } from "../config";
import { getDepsOptimizer } from "../optimizer/optimizer";
import { optimizedDepNeedsInterop } from "../optimizer";
import { makeLegalIdentifier } from '@rollup/pluginutils';
import { ModuleNode } from '../server/ModuleGraph';
import { lexAcceptedHmrDeps } from '../server/hmr';

const optimizedDepChunkRE = /\/chunk-[A-Z\d]{8}\.js/;

const isExplicitImportRequired = (url: string): boolean => !isJSRequest(cleanUrl(url)) && !isCSSRequest(url);

// 对于一些静态资源，比如获取svg，img，会在请求后面加上 ?import 后缀
const markExplicitImport = (url: string) => isExplicitImportRequired(url) ? url + '?import' : url;

export function importAnalysisPlugin(config: ResolvedConfig): Plugin {
    let serverContext: ServerContext;
    const { root, base } = config;
    const clientPublicPath = path.posix.join('/', CLIENT_PUBLIC_PATH);
    return {
        name: "m-vite:import-analysis",
        configureServer(s) {
            // 保存服务端上下文
            serverContext = s;
        },
        async transform(code: string, importer: string) {
            // 只处理 JS 相关的请求
            if (!isJSRequest(importer) || isInternalRequest(importer)) return null;
            // 必须在parse前调用
            await init;
            // 解析 import 语句
            const [imports] = parse(code);
            let s: MagicString | undefined;
            const str = () => s || (s = new MagicString(code));
            const normalizeUrl = async (url: string, pos: number) => {
                const resolved = await this.resolve!(url, importer);
                if (!resolved) console.error('error');
                const id = resolved.id;
                if (id.startsWith(root + '/')) {
                    url = id.slice(root.length);
                }
                if (isExternalUrl(url)) {
                    return [url, url];
                }
                // 对于非js和非css的资源，例如静态资源，会在在url后面加上 ?import 后缀
                url = markExplicitImport(url);
                return [url, id];
            };
            const depsOptimizer = getDepsOptimizer(config);
            const { moduleGraph } = serverContext;
            const importerModule = moduleGraph.getModuleById(importer)!;
            const importedUrls: Set<string | ModuleNode> = new Set();
            const toAbsoluteUrl = (url: string) =>
                path.posix.resolve(path.posix.dirname(importerModule.url), url)
            let hasHMR = false;
            let isSelfAccepting = false;
            const acceptedUrls = new Set<{
                url: string
                start: number
                end: number
            }>();
            // 对每一个 import 语句依次进行分析
            for (let index = 0; index < imports.length; index++) {
                const importInfo = imports[index];
                let { s: modStart, e: modEnd, n: specifier } = importInfo;

                const rawUrl = code.slice(modStart, modEnd);

                // 判断模块内部是否用了hmr api
                if (rawUrl === "import.meta") {
                    const prop = code.slice(modEnd, modEnd + 4);
                    if (prop === '.hot') {
                        hasHMR = true;
                        if (code.slice(modEnd + 4, modEnd + 11) === '.accept') {
                            // 解析aceept接受的依赖
                            if (
                                lexAcceptedHmrDeps(
                                    code,
                                    code.indexOf('(', modEnd + 11) + 1,
                                    acceptedUrls,
                                )
                            ) {
                                // 接受自身更新
                                isSelfAccepting = true;
                            }
                        }
                    }
                }

                /**
                 * 静态导入或动态导入中的有效字符串，如果可以解析，让我们解析它
                 */
                if (!specifier) continue;
                const [url, resolvedId] = await normalizeUrl(specifier, modStart);
                // 静态资源
                let rewriteDone = false;
                /**
                 * 对于优化的 cjs deps，通过将命名导入重写为 const 赋值来支持命名导入
                 * 内部优化的块不需要 es interop 并且被排除在外（chunk-xxxx）
                 */
                if (
                    depsOptimizer?.isOptimizedDepFile(resolvedId) &&
                    !resolvedId.match(optimizedDepChunkRE)
                ) {
                    const file = cleanUrl(resolvedId); // 删除 ?v={hash}
                    const needsInterop = await optimizedDepNeedsInterop(depsOptimizer.metadata, file, config);
                    if (needsInterop) {
                        interopNamedImports(str(), imports[index], url, index);
                        rewriteDone = true;
                    }
                }
                if (!rewriteDone) {
                    str().overwrite(modStart, modEnd, url, {
                        contentOnly: true,
                    });
                }
                importedUrls.add(url)
            }

            // 只对使用了hmr api的模块进行处理
            if (hasHMR) {
                // 注入 HMR 相关的工具函数
                str().prepend(
                    `import { createHotContext as __vite__createHotContext } from "${clientPublicPath}";` +
                    `import.meta.hot = __vite__createHotContext(${JSON.stringify(importerModule.url)});`,
                )
            }

            // 对热更新 accept 中的 url 做处理
            const normalizedAcceptedUrls = new Set<string>()
            for (const { url, start, end } of acceptedUrls) {
                const [normalized] = await moduleGraph.resolveUrl(
                    toAbsoluteUrl(markExplicitImport(url)),
                )
                normalizedAcceptedUrls.add(normalized)
                str().overwrite(start, end, JSON.stringify(normalized), {
                    contentOnly: true,
                })
            }

            // 处理非css资源的模块依赖图，css的依赖关系由css插件内部处理
            if (!isCSSRequest(importer)) await moduleGraph.updateModuleInfo(importerModule, importedUrls, normalizedAcceptedUrls, isSelfAccepting);

            if (s) return transformStableResult(s);
            return {
                code
            };
        },
    };
}

/**
 * @author: Zhouqi
 * @description: 将import名称进行替换操作，对于cjs deps，通过将命名导入重写为const赋值来支持命名导入
 */
export const interopNamedImports = (
    str: MagicString,
    importSpecifier: ImportSpecifier,
    rewrittenUrl: string,
    importIndex: number,
) => {
    const source = str.original;
    const { s: start, e: end, ss: expStart, se: expEnd, d: dynamicIndex, } = importSpecifier;
    if (dynamicIndex > -1) {
        // 重写 `import('package')` 为default默认导入
        str.overwrite(expStart, expEnd, `import('${rewrittenUrl}').then(m => m.default && m.default.__esModule ? m.default : ({ ...m.default, default: m.default }))`, { contentOnly: true });
    } else {
        const exp = source.slice(expStart, expEnd);
        const rawUrl = source.slice(start, end);
        // 重写内容
        const rewritten = transformCjsImport(exp, rewrittenUrl, rawUrl, importIndex);
        rewritten ?
            str.overwrite(expStart, expEnd, rewritten, { contentOnly: true }) :
            // export * from '...'
            str.overwrite(start, end, rewrittenUrl, { contentOnly: true });
    }
};

type ImportNameSpecifier = { importedName: string; localName: string }

export const transformCjsImport = (
    importExp: string,
    url: string,
    rawUrl: string,
    importIndex: number,
): string | undefined => {
    const node = (
        parseJS(importExp, {
            ecmaVersion: 'latest',
            sourceType: 'module',
        }) as any
    ).body[0];

    if (node.type === 'ImportDeclaration' ||
        node.type === 'ExportNamedDeclaration') {
        if (!node.specifiers.length) {
            return `import "${url}"`;
        }
        const importNames: ImportNameSpecifier[] = [];
        const exportNames: string[] = [];
        let defaultExports: string = '';
        for (const spec of node.specifiers) {
            if (
                spec.type === 'ImportSpecifier' &&
                spec.imported.type === 'Identifier'
            ) {
                const importedName = spec.imported.name;
                const localName = spec.local.name;
                importNames.push({ importedName, localName });
            } else if (spec.type === 'ImportDefaultSpecifier') {
                importNames.push({
                    importedName: 'default',
                    localName: spec.local.name,
                });
            } else if (spec.type === 'ImportNamespaceSpecifier') {
                importNames.push({ importedName: '*', localName: spec.local.name });
            } else if (
                spec.type === 'ExportSpecifier' &&
                spec.exported.type === 'Identifier'
            ) {
                // for ExportSpecifier, local name is same as imported name
                // prefix the variable name to avoid clashing with other local variables
                const importedName = spec.local.name;
                // we want to specify exported name as variable and re-export it
                const exportedName = spec.exported.name;
                if (exportedName === 'default') {
                    defaultExports = makeLegalIdentifier(
                        `__vite__cjsExportDefault_${importIndex}`,
                    );
                    importNames.push({ importedName, localName: defaultExports });
                } else {
                    const localName = makeLegalIdentifier(
                        `__vite__cjsExport_${exportedName}`,
                    );
                    importNames.push({ importedName, localName });
                    exportNames.push(`${localName} as ${exportedName}`);
                }
            }
        }

        // If there is multiple import for same id in one file,
        // importIndex will prevent the cjsModuleName to be duplicate
        const cjsModuleName = makeLegalIdentifier(
            `__vite__cjsImport${importIndex}_${rawUrl}`,
        );
        const lines: string[] = [`import ${cjsModuleName} from "${url}"`]
        importNames.forEach(({ importedName, localName }) => {
            if (importedName === '*') {
                lines.push(`const ${localName} = ${cjsModuleName}`);
            } else if (importedName === 'default') {
                lines.push(
                    `const ${localName} = ${cjsModuleName}.__esModule ? ${cjsModuleName}.default : ${cjsModuleName}`,
                );
            } else {
                lines.push(`const ${localName} = ${cjsModuleName}["${importedName}"]`);
            }
        })
        if (defaultExports) {
            lines.push(`export default ${defaultExports}`);
        }
        if (exportNames.length) {
            lines.push(`export { ${exportNames.join(', ')} }`);
        }

        return lines.join('; ');
    }
    return;
}