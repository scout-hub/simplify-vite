/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 14:50:16
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 16:38:49
 */
import path from "path";
import fs from 'fs';
import resolve from "resolve";
import { exports } from 'resolve.exports';
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";
import { pathExists } from "fs-extra";
import { DEFAULT_EXTERSIONS } from "../constants";
import { bareImportRE, cleanUrl, normalizePath } from "../utils";
import { PackageData, resolvePackageData } from "../packages";
import { DepsOptimizer, optimizedDepInfoFromId } from "../optimizer";

export interface ResolveOptions {
    extensions?: string[]
}

export function resolvePlugin(resolveOptions: Record<string, any>): Plugin {
    let serverContext: ServerContext;
    const { root } = resolveOptions;
    return {
        name: "m-vite:resolve",
        configureServer(s) {
            // 保存服务端上下文
            serverContext = s;
        },
        async resolveId(id: string, importer?: string, resolveOpts?: Record<string, any>) {
            const options = {
                ...resolveOptions,
                scan: resolveOpts?.scan ?? resolveOptions.scan,
            };
            const depsOptimizer = resolveOptions.getDepsOptimizer?.();

            // 预构建依赖的特殊处理
            if (depsOptimizer?.isOptimizedDepUrl(id)) {
                return normalizePath(path.resolve(root, id.slice(1)));;
            }
            // 1. 绝对路径
            if (path.isAbsolute(id)) {
                // 本身就是绝对路径，直接返回
                if (await pathExists(id)) {
                    return { id };
                }
                // 加上 root 路径前缀，处理 /src/main.tsx 的情况
                id = path.join(serverContext.root, id);
                if (await pathExists(id)) {
                    return { id };
                }
            }
            // 如果 importer 之前没有被 vite 的解析器解析（当 esbuild 解析它时）解析 importer 的 pkg 并添加到 idToPkgMap
            // 2. 相对路径
            else if (id.startsWith(".")) {
                if (!importer) {
                    throw new Error("`importer` should not be undefined");
                }
                const basedir = importer ? path.dirname(importer) : process.cwd();
                const fsPath = path.resolve(basedir, id);
                let res;
                if ((res = tryFsResolve(fsPath, options))) {
                    return {
                        id: res,
                    };
                }
                const hasExtension = path.extname(id).length > 1;
                let resolvedId: string;
                // 2.1 包含文件名后缀
                // 如 ./App.tsx
                if (hasExtension) {
                    resolvedId = normalizePath(resolve.sync(id, { basedir: path.dirname(importer) }));
                    if (await pathExists(resolvedId)) {
                        return { id: resolvedId };
                    }
                }
                // 2.2 不包含文件名后缀
                // 如 ./App
                else {
                    // ./App -> ./App.tsx
                    for (const extname of DEFAULT_EXTERSIONS) {
                        try {
                            const withExtension = `${id}${extname}`;
                            resolvedId = normalizePath(resolve.sync(withExtension, {
                                basedir: path.dirname(importer),
                            }));
                            if (await pathExists(resolvedId)) {
                                return { id: resolvedId };
                            }
                        } catch (e) {
                            continue;
                        }
                    }
                }
            }
            // 外部包的导入
            if (bareImportRE.test(id)) {
                let res;
                if (
                    // 非预构建阶段执行
                    !options.scan &&
                    depsOptimizer &&
                    (res = await tryOptimizedResolve(depsOptimizer, id, importer))
                ) {
                    return res;
                }
                if ((res = tryNodeResolve(id, importer, options, true))) {
                    return res as any;
                }
            }
            return null;
        },
    };
}

/**
 * @author: Zhouqi
 * @description: 解析优化路径
 */
export const tryOptimizedResolve = async (
    depsOptimizer: DepsOptimizer,
    id: string,
    importer?: string,
) => {
    const metadata = depsOptimizer.metadata;
    const depInfo = optimizedDepInfoFromId(metadata, id);
    if (depInfo) return depsOptimizer.getOptimizedDepId(depInfo);
    if (!importer) return;
    console.error('error');
    return '';
};

/**
 * @author: Zhouqi
 * @description: 路径解析
 */
export const tryNodeResolve = (
    id: string,
    importer: string | null | undefined,
    options: Record<string, any>,
    targetWeb: boolean
) => {
    const { packageCache, preserveSymlinks } = options;
    // 解析斜杠资源路径 ====> import xxx from 'a/b';
    let nestedPath = id;
    const possiblePkgIds = [];
    for (let prevSlashIndex = -1; ;) {
        let slashIndex = nestedPath.indexOf('/', prevSlashIndex + 1);
        // 没找到/模式引入的方式，则将/的位置定义到最后
        slashIndex === -1 && (slashIndex = nestedPath.length);
        // 截取/之前的部分
        const part = nestedPath.slice(prevSlashIndex + 1, (prevSlashIndex = slashIndex));
        // 路径已经解析完了
        if (!part) {
            break;
        }
        /**
         * 假设带有扩展名的路径部分不是包根，除了 
         * 第一个路径部分（因为包名称中允许使用句点）。 
         * 同时，如果第一个路径部分以“@”开头，则跳过（因为“@foo/bar”应该被视为顶级路径)
         */
        if (possiblePkgIds.length ? path.extname(part) : part[0] === '@') {
            continue;
        }
        const possiblePkgId = nestedPath.slice(0, slashIndex);
        possiblePkgIds.push(possiblePkgId);
    }
    let basedir = '';
    if (importer &&
        path.isAbsolute(importer) &&
        fs.existsSync(cleanUrl(importer))) {
        basedir = path.dirname(importer);
    }
    // 最近的有package.json的包
    let nearestPkg;
    // 获取包的根路径
    const rootPkgId = possiblePkgIds[0];
    const rootPkg = resolvePackageData(rootPkgId, basedir, preserveSymlinks, packageCache);
    const nearestPkgId = [...possiblePkgIds].reverse().find((pkgId) => {
        nearestPkg = resolvePackageData(pkgId, basedir, preserveSymlinks, packageCache)!;
        return nearestPkg;
    })!;
    let pkg: PackageData | undefined;
    let pkgId: string | undefined;
    // 如果package.json中存在的export，则将包ID指定为rootPkgId，后面需要根据export查找如何文件
    if (rootPkg?.data?.exports) {
        pkgId = rootPkgId;
        pkg = rootPkg;
    } else {
        // 比如react的scheduler包
        pkgId = nearestPkgId;
        pkg = nearestPkg;
    }
    if (!pkg || !nearestPkg) {
        console.error(`[vite] failed to resolve ${id} from ${importer || process.cwd()}`);
        return;
    }
    let resolveId = resolvePackageEntry;
    let unresolvedId = pkgId;
    // 深度导入，即不是根包的导入
    const isDeepImport = unresolvedId !== nestedPath;
    if (isDeepImport) {
        resolveId = resolveDeepImport;
        unresolvedId = '.' + nestedPath.slice(pkgId.length);
    }
    let resolved: string | undefined;
    resolved = resolveId(unresolvedId, pkg, targetWeb, options);
    // TODO 解决构建的包副作用，以便 rollup 可以更好地执行 tree-shaking
    return {
        id: resolved
    };
};

/**
 * @author: Zhouqi
 * @description: 解析深度导入
 */
const resolveDeepImport = (
    id: string,
    {
        setResolvedCache,
        getResolvedCache,
        dir,
        data,
    }: PackageData,
    targetWeb: boolean,
    options: Record<string, any>
): string | undefined => {
    const cache = getResolvedCache(id);
    // 有缓存则直接返回
    if (cache) return cache;
    let relativeId = id;
    const { exports: exportsField } = data;
    if (exportsField) {
        const exportsId = resolveExports(data, id, options, targetWeb);
        exportsId && (relativeId = exportsId);
    }
    if (relativeId) {
        const resolved = tryFsResolve(path.join(dir, relativeId), options);
        if (resolved) {
            // 缓存解析结果
            setResolvedCache(id, resolved);
            return resolved;
        }
    }
};

/**
 * @author: Zhouqi
 * @description: 解析package.json中的入口文件
 */
export const resolvePackageEntry = (
    id: string,
    { dir, data, setResolvedCache, getResolvedCache }: PackageData,
    targetWeb: boolean,
    options: any
) => {
    const cached = getResolvedCache('.');
    if (cached) {
        return cached;
    }
    let entryPoint;
    if (data.exports) {
        entryPoint = resolveExports(data, '.', options, targetWeb);
    }
    // 如果没有解析道exports，则使用main属性的值
    entryPoint || (entryPoint = data.main);
    // 获取入口文件的绝对路径
    const entryPointPath = path.join(dir, entryPoint);
    const resolvedEntryPoint = tryFsResolve(entryPointPath, options);
    // 缓存解析结果
    if (resolvedEntryPoint) {
        setResolvedCache('.', resolvedEntryPoint);
        return resolvedEntryPoint;
    }
}

/**
 * @author: Zhouqi
 * @description: 解析epxorts
 */
const resolveExports = (
    pkg: PackageData['data'],
    key: string,
    options: any,
    targetWeb: boolean,
) => {
    const conditions: string[] = [];
    // 获取package.json中对应type的入口文件
    const result = exports(pkg, key, {
        browser: targetWeb && !conditions.includes('node'),
        require: options.isRequire && !conditions.includes('import'),
        conditions
    });
    return result ? result[0] : undefined;
}

const tryFsResolve = (fsPath: string, options: any) => {
    let res;
    if ((res = tryResolveFile(fsPath, '', options))) {
        return res;
    }
    // 尝试添加后缀名获取文件
    for (const ext of options.extensions) {
        if (res = tryResolveFile(fsPath + ext, '', options)) {
            return res;
        }
    }
};

/**
 * @author: Zhouqi
 * @description: 获取文件信息状态
 */
const tryResolveFile = (
    file: string,
    postfix: string,
    options: any
) => {
    let stat;
    try {
        // 获取文件信息，判断文件是否存在
        stat = fs.statSync(file, { throwIfNoEntry: false });
    }
    catch {
        return;
    }
    // 如果文件存在则获取文件的真实路径
    if (stat) {
        return getRealPath(file, options.preserveSymlinks) + postfix;
    }
}

/**
 * @author: Zhouqi
 * @description: 获取真实路径
 */
const getRealPath = (resolved: string, preserveSymlinks?: boolean) => {
    // 用于同步计算给定路径的规范路径名。它是通过解决。,..以及路径中的符号链接，并返回解析后的路径
    resolved = fs.realpathSync(resolved);
    return normalizePath(resolved);
};