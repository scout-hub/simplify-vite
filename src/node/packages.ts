/*
 * @Author: Zhouqi
 * @Date: 2023-05-13 21:50:36
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-14 22:15:38
 */
import fs from 'fs';
import path from 'path';
import { resolveFrom } from "./utils";

export interface PackageData {
    dir: string
    nodeResolvedImports: Record<string, string | undefined>
    setResolvedCache: (key: string, entry: string) => void
    getResolvedCache: (key: string) => string | undefined
    data: {
        [field: string]: any
        name: string
        type: string
        version: string
        main: string
        module: string
        browser: string | Record<string, string | false>
        exports: string | Record<string, any> | string[]
        dependencies: Record<string, string>
    }
}

export type PackageCache = Map<string, PackageData>

/**
 * @author: Zhouqi
 * @description: 解析包内部的Package.json
 */
export function resolvePackageData(
    id: string,
    basedir: string,
    preserveSymlinks = false,
    packageCache?: PackageCache
) {
    let pkg;
    let pkgPath;
    // 获取对应包的package.json软链路径
    pkgPath = resolveFrom(`${id}/package.json`, basedir, preserveSymlinks);
    // 获取对应package.json的内容
    pkg = loadPackageData(pkgPath, true, packageCache);
    packageCache?.set(pkgPath, pkg);
    return pkg;
}

/**
 * @author: Zhouqi
 * @description: 获取package.json的内容
 */
export function loadPackageData(pkgPath: string, preserveSymlinks?: boolean, packageCache?: PackageCache) {
    // 读取package.json文件内容
    const data = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // 获取文件目录
    const pkgDir = path.dirname(pkgPath);
    // todo sideEffect
    const pkg: PackageData = {
        dir: pkgDir,
        data,
        nodeResolvedImports: {},
        setResolvedCache(key: string, entry: string) {
            pkg.nodeResolvedImports[key] = entry;
        },
        getResolvedCache(key: string) {
            return pkg.nodeResolvedImports[key];
        },
    };
    // 缓存解析过的package.json
    packageCache?.set(pkgPath, pkg);
    return pkg;
}