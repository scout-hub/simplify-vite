/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:30:42
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-16 20:38:28
 */
import { Plugin, build } from "esbuild";
import { BARE_IMPORT_RE, EXTERNAL_TYPES, JS_TYPES_RE } from "../constants";
import glob from 'fast-glob';
import fs from 'node:fs';
import { PluginContainer, createPluginContainer } from "../pluginContainer";
import { cleanUrl, dataUrlRE, externalRE, normalizePath } from "../utils";
import path from "node:path";

/**
 * @author: Zhouqi
 * @description: 预构建时扫描依赖
 */
export const scanPlugin = (deps: Set<string>): Plugin => {
    return {
        name: "esbuild:scan-deps",
        setup(build) {
            // 忽略的文件类型
            build.onResolve(
                { filter: new RegExp(`\\.(${EXTERNAL_TYPES.join("|")})$`) },
                (resolveInfo) => ({
                    path: resolveInfo.path,
                    // 打上 external 标记
                    external: true,
                })
            );
            // 记录依赖
            build.onResolve(
                {
                    filter: BARE_IMPORT_RE,
                },
                (resolveInfo) => {
                    const { path: id } = resolveInfo;
                    // 推入 deps 集合中
                    deps.add(id);
                    return {
                        path: id,
                        external: true,
                    };
                }
            );
        }
    };
}

const htmlTypesRE = /\.(html|vue|svelte|astro|imba)$/;
const scriptModuleRE = /(<script\b[^>]+type\s*=\s*(?:"module"|'module')[^>]*>)(.*?)<\/script>/gis
const srcRE = /\bsrc\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s'">]+))/i;
export const commentRE = /<!--.*?-->/gs;

/**
 * @author: Zhouqi
 * @description: 预构建时扫描依赖
 */
export const scanImports = async (config: Record<string, any>): Promise<{ deps: Record<string, string> }> => {
    /**
     * 如果不配置build.rollupOptions.input或者config.optimizeDeps.entries
     * vite默认会从index.html中扫描依赖
     * 
     * 扫描优先级最高的为config.optimizeDeps.entries，其次是build.rollupOptions.input
     * 最后才是默认的index.html
     */
    const explicitEntryPatterns = config.optimizeDeps.entries;
    const buildInput = config.build.rollupOptions?.input;
    let entries: string[];
    if (explicitEntryPatterns) {
        entries = await globEntries(explicitEntryPatterns, config);
    } else if (buildInput) {
        // TODO
        entries = [];
    } else {
        entries = await globEntries('**/*.html', config);
    }
    // 过滤出符合需要扫描的资源
    entries = entries.filter(item => isScannable(item) && fs.existsSync(item));
    let deps = {};
    let missing = {};
    if (!entries.length) {
        return {
            deps
        };
    }
    const container = createPluginContainer(config);
    const plugin = esbuildScanPlugin(config, container, deps, missing, entries);
    // 通过esbuild预构建分析需要打包的资源存储到deps中
    await build({
        write: false,
        stdin: {
            contents: entries.map((e) => `import ${JSON.stringify(e)}`).join('\n'),
            loader: 'js',
        },
        bundle: true,
        plugins: [plugin],
    });
    return {
        deps
    };
};

/**
 * @author: Zhouqi
 * @description: esbuild扫描插件
 */
const esbuildScanPlugin = (
    config: Record<string, any>,
    container: PluginContainer,
    depImports: Record<string, string>,
    missing: Record<string, string>,
    entries: string[],
) => {
    // 遍历过的直接缓存到seen上
    const seen = new Map<string, string | undefined>();
    const include = config.optimizeDeps?.include;
    const externalUnlessEntry = ({ path }: { path: string }) => ({
        path,
        external: !entries.includes(path),
    });
    const resolve = async (
        id: string,
        importer?: string,
        options?: Record<string, any>,
    ) => {
        const key = id + (importer && path.dirname(importer));
        if (seen.has(key)) {
            return seen.get(key);
        }
        const resolved = await container.resolveId(id, importer && normalizePath(importer));
        const res = resolved?.id;
        seen.set(key, res);
        return res;
    };
    return {
        name: 'vite:dep-scan',
        setup(build: any) {
            // http/https开头的外部请求资源不做处理
            build.onResolve({ filter: externalRE }, ({ path }: any) => ({
                path,
                external: true,
            }));

            // base64资源不做处理
            build.onResolve({ filter: dataUrlRE }, ({ path }: any) => ({
                path,
                external: true,
            }));

            // 对html vue等文件处理
            build.onResolve({ filter: htmlTypesRE }, async ({ path, importer }: any) => {
                const resolved = await resolve(path, importer);
                return {
                    path: resolved,
                    namespace: 'html',
                };
            });

            // 对html内容处理
            build.onLoad({ filter: htmlTypesRE, namespace: 'html' }, async ({ path }: any) => {
                // 读取文件内容
                let raw = fs.readFileSync(path, 'utf-8');
                // 去除注释中的内容
                raw = raw.replace(commentRE, '<!---->');
                let match;
                while ((match = scriptModuleRE.exec(raw))) {
                    const [, openTag] = match;
                    // 获取script中的src标记
                    const srcMatch = openTag.match(srcRE);
                    let js = '';
                    if (srcMatch) {
                        const src = srcMatch[1] || srcMatch[2] || srcMatch[3];
                        js += `import ${JSON.stringify(src)}\n`;
                    }
                    // 将script引入方式转换为import方式
                    js += '\nexport default {}';
                    // 通过js的方式去解析
                    return {
                        loader: 'js',
                        contents: js,
                    };
                }
            });

            // 所有import的文件处理
            build.onResolve({
                // avoid matching windows volume
                filter: /^[\w@][^:]/,
            }, async ({ path: id, importer, pluginData }: any) => {
                // 已经处理过的同一个资源直接返回
                if (depImports[id]) {
                    return externalUnlessEntry({ path: id });
                }
                const resolved = await resolve(id, importer);
                if (resolved) {
                    if (resolved.includes('node_modules') || include?.includes(id)) {
                        depImports[id] = resolved;
                        return externalUnlessEntry({ path: id });
                    }
                }
            });

            // 其它文件处理
            build.onResolve({
                filter: /.*/,
            }, async ({ path: id, importer }: any) => {
                // 调用vite内部的resolve插件进行路径解析
                const resolved = await resolve(id, importer);
                if (resolved) {
                    return {
                        path: path.resolve(cleanUrl(resolved)),
                    };
                }
                return externalUnlessEntry({ path: id });
            });

            // 其它文件处理
            build.onLoad({
                filter: JS_TYPES_RE,
            }, async ({ path: id }: any) => {
                // 获取文件后缀
                let ext = path.extname(id).slice(1);
                // 读取文件内容
                let contents = fs.readFileSync(id, 'utf-8');
                // 根据文件后缀决定使用什么loader
                const loader = ext;
                return {
                    contents,
                    loader
                }
            });
        }
    }
};

/**
 * @author: Zhouqi
 * @description: 遍历文件入口
 */
const globEntries = (pattern: string | string[], config: Record<string, any>) => {
    return glob(pattern, {
        cwd: config.root,
        // 忽略的文件 node_modules 输出目录
        ignore: [
            '**/node_modules/**',
            `**/${config.build.outDir}/**`,
            // 如果配置了optimizeDeps，但是没有配置entries，则默认会忽略以下文件
            ...(config.optimizeDeps.entries
                ? []
                : [`**/__tests__/**`, `**/coverage/**`]),
        ],
        // 返回条目的绝对路径
        absolute: true,
    })
}

/**
 * @author: Zhouqi
 * @description: 是否需要被扫描
 */
const isScannable = (id: string) => JS_TYPES_RE.test(id) || htmlTypesRE.test(id);
