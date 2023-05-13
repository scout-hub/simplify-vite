/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 14:50:16
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-13 22:16:14
 */
import path from "path";
import fs from 'fs';
import resolve from "resolve";
import { Plugin } from "../plugin";
import { ServerContext } from "../server/index";
import { pathExists } from "fs-extra";
import { DEFAULT_EXTERSIONS } from "../constants";
import { cleanUrl, normalizePath } from "../utils";
import { PackageData, resolvePackageData } from "../packages";

export function resolvePlugin(): Plugin {
    let serverContext: ServerContext;
    return {
        name: "m-vite:resolve",
        configureServer(s) {
            // 保存服务端上下文
            serverContext = s;
        },
        async resolveId(id: string, importer?: string) {
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
            // 2. 相对路径
            else if (id.startsWith(".")) {
                if (!importer) {
                    throw new Error("`importer` should not be undefined");
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
            return null;
        },
    };
}

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
    // 解析斜杠资源路径 ====>import xxx from 'a/b';
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
    // 获取包的根路径
    const rootPkgId = possiblePkgIds[0];
    const rootPkg = resolvePackageData(rootPkgId, basedir, preserveSymlinks, packageCache);
    let pkg: PackageData;
    let pkgId = '';
    // 如果package.json中存在的export，则将包ID指定为rootPkgId，后面需要根据export查找如何文件
    if (rootPkg?.data?.exports) {
        pkgId = rootPkgId;
        pkg = rootPkg;
    }
    let resolveId = resolvePackageEntry;
    let unresolvedId = pkgId;
    let resolved;
    resolved = resolveId(unresolvedId, pkg!, targetWeb, options);
    return {
        id
    }
};

/**
 * @author: Zhouqi
 * @description: 解析package.json中的入口文件
 */
export const resolvePackageEntry = (
    id: string,
    { dir, data }: PackageData,
    targetWeb: boolean,
    options: any
) => {
    let entryPoint;
    if (data.exports) {
        // entryPoint = resolveExports(data, '.', options, targetWeb);
    }
}
