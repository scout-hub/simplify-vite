/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:47:03
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-17 14:42:52
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

interface LookupFileOptions {
    pathOnly?: boolean
}

/**
 * @author: Zhouqi
 * @description: 文件查找
 */
export const lookupFile = (
    dir: string,
    filenames: string[],
    options?: LookupFileOptions,
): string | undefined => {
    for (const format of filenames) {
        const fullPath = path.join(dir, format)
        if (fs.existsSync(fullPath)) {
            const result = options?.pathOnly ?
                fullPath :
                fs.readFileSync(fullPath, 'utf-8');
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
     * preserveSymlinks 为true时，会将原路径返回; 为false时，会调用toRealPath方法，返回软链原始文件的路径。
     */
    return resolve.sync(id, {
        basedir,
        paths: [],
        extensions: DEFAULT_EXTENSIONS,
        // 必须与 pnpm 一起工作
        preserveSymlinks,
    });
}

/**
 * @author: Zhouqi
 * @description: 动态import方式，如果不支持esm引入方式时会回退到require引入方式（createRequire）
 */
export const dynamicImport = new Function('file', 'return import(file)');


/**
 * @author: Zhouqi
 * @description: 合并配置
 */
export const mergeConfig = (
    defaults: Record<string, any>,
    overrides: Record<string, any>,
    isRoot = true,
): Record<string, any> => {
    return mergeConfigRecursively(defaults, overrides);
}

export const isObject = (value: unknown): boolean => Object.prototype.toString.call(value) === '[object Object]';

export const arraify = <T>(target: T | T[]): T[] => isArray(target) ? target : [target];

export const isArray = Array.isArray;

export const mergeConfigRecursively = (
    defaults: Record<string, any>,
    overrides: Record<string, any>
) => {
    const merged: Record<string, any> = { ...defaults }
    for (const key in overrides) {
        const value = overrides[key];
        if (value == null) continue;
        const existing = merged[key];
        if (existing == null) {
            merged[key] = value;
            continue;
        }
        if (isArray(existing) || isArray(value)) {
            merged[key] = [...arraify(existing ?? []), ...arraify(value ?? [])];
            continue;
        }
        if (isObject(existing) && isObject(value)) {
            merged[key] = mergeConfigRecursively(
                existing,
                value
            )
            continue;
        }
        merged[key] = value;
    }
    return merged;
}

export const externalRE = /^(https?:)?\/\//;
export const dataUrlRE = /^\s*data:/i
export const bareImportRE = /^[\w@](?!.*:\/\/)/

/**
 * @author: Zhouqi
 * @description: 删除文件以及目录
 */
export function emptyDir(dir: string): void {
    for (const file of fs.readdirSync(dir)) {
        // recursive：布尔值。是否递归删除目录
        // force: 布尔值。如果路径不存在，则将忽略异常。
        fs.rmSync(path.resolve(dir, file), { recursive: true, force: true })
    }
}

/**
 * @author: Zhouqi
 * @description: 写入文件
 */
export function writeFile(
    filename: string,
    content: string | Uint8Array,
): void {
    const dir = path.dirname(filename);
    if (!fs.existsSync(dir)) {
        // recursive: 布尔值。是否创建父目录
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filename, content);
}

export const flattenId = (id: string): string =>
    id
        .replace(/[/:]/g, '_')
        .replace(/\./g, '__')
        .replace(/(\s*>\s*)/g, '___')

export const isExternalUrl = (url: string): boolean => externalRE.test(url)