/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:47:03
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-13 21:48:43
 */
import os from "os";
import path from "path";
import fs from "fs";
import { builtinModules } from 'node:module'
import resolve from 'resolve';
// 调试包
import { HASH_RE, QEURY_RE, JS_TYPES_RE, CLIENT_PUBLIC_PATH, DEFAULT_EXTENSIONS } from "./constants";

const INTERNAL_LIST = [CLIENT_PUBLIC_PATH, "/@react-refresh"];

export const slash = (p: string): string => p.replace(/\\/g, "/");
export const isWindows = os.platform() === "win32";
export const normalizePath = (id: string): string => path.posix.normalize(isWindows ? slash(id) : id);
export const isJSRequest = (id: string): boolean => {
    id = cleanUrl(id);
    if (JS_TYPES_RE.test(id)) {
        return true;
    }
    if (!path.extname(id) && !id.endsWith("/")) {
        return true;
    }
    return false;
};

export const cleanUrl = (url: string): string =>
    url.replace(HASH_RE, "").replace(QEURY_RE, "");

export const isCSSRequest = (id: string): boolean =>
    cleanUrl(id).endsWith(".css");

export function isImportRequest(url: string): boolean {
    return url.endsWith("?import");
}

export function getShortName(file: string, root: string) {
    return file.startsWith(root + "/") ? path.posix.relative(root, file) : file;
}

export function removeImportQuery(url: string): string {
    return url.replace(/\?import$/, "");
}

export function isInternalRequest(url: string): boolean {
    return INTERNAL_LIST.includes(url);
}

/**
 * @author: Zhouqi
 * @description: 文件查找
 */
export const lookupFile = (dir: string, filenames: string[]): string | undefined => {
    for (const format of filenames) {
        const fullPath = path.join(dir, format)
        if (fs.existsSync(fullPath)) {
            const result = fs.readFileSync(fullPath, 'utf-8');
            return result;
        }
    }
};

// 内置模块
const builtins = new Set([
    ...builtinModules,
    'assert/strict',
    'diagnostics_channel',
    'dns/promises',
    'fs/promises',
    'path/posix',
    'path/win32',
    'readline/promises',
    'stream/consumers',
    'stream/promises',
    'stream/web',
    'timers/promises',
    'util/types',
    'wasi',
]);

/**
 * @author: Zhouqi
 * @description: 判断是否是内置模块
 */
export function isBuiltin(id: string): boolean {
    return builtins.has(id.replace(/^node:/, ''))
}

/**
 * @author: Zhouqi
 * @description: 解析模块路径
 */
export function resolveFrom(id: string, basedir: string, preserveSymlinks = false) {
    /**
     * 同步解析模块路径字符串id，返回结果并在id无法解析时抛出错误
     * basedir 要开始解析的目录
     * extensions 要按顺序搜索的文件扩展名数组
     * path 要解析的路径
     * preserveSymlinks 为true时，会将原路径返回;为false时，会调用toRealPath方法，返回软链原始文件的路径。
     */
    console.log(id);
    return resolve.sync(id, {
        basedir,
        paths: [],
        extensions: DEFAULT_EXTENSIONS,
        // 必须与 pnpm 一起工作
        preserveSymlinks: preserveSymlinks,
    });
}