/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:10:19
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-26 09:02:56
 */
import type { ImportSpecifier } from 'es-module-lexer';
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
import { parse as parseJS } from 'acorn';
// magic-string 用来作字符串编辑
import MagicString from "magic-string";
import path from "path";
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";
import { pathExists } from "fs-extra";
import resolve from "resolve";
import { ResolvedConfig } from "../config";
import { getDepsOptimizer } from "../optimizer/optimizer";
import { optimizedDepNeedsInterop } from "../optimizer";
import { makeLegalIdentifier } from '@rollup/pluginutils';

const optimizedDepChunkRE = /\/chunk-[A-Z\d]{8}\.js/;

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
            const depsOptimizer = getDepsOptimizer(config);
            const { moduleGraph } = serverContext;
            const curMod = moduleGraph.getModuleById(importer)!;
            const importedModules = new Set<string>();
            // 对每一个 import 语句依次进行分析
            for (let index = 0; index < imports.length; index++) {
                const importInfo = imports[index];
                let { s: modStart, e: modEnd, n: specifier } = importInfo;
                // 静态导入或动态导入中的有效字符串
                // 如果可以解析，让我们解析它
                if (!specifier) continue;
                const [url, resolvedId] = await normalizeUrl(specifier, modStart);
                // 静态资源
                // if (specifier.endsWith(".svg")) {
                //     // 加上 ?import 后缀
                //     const resolvedUrl = path.join(path.dirname(importer), specifier);
                //     ms.overwrite(modStart, modEnd, `${resolvedUrl}?import`);
                //     continue;
                // }
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
                // 第三方库: 路径重写到预构建产物的路径
                if (BARE_IMPORT_RE.test(specifier)) {
                    str().overwrite(modStart, modEnd, url);
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