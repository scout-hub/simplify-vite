/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:32:31
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 15:26:30
 */
// 增加如下代码
import path from "path";

export const ESBUILD_MODULES_TARGET = [
    'es2020', // support import.meta.url
    'edge88',
    'firefox78',
    'chrome87',
    'safari14',
]

export const EXTERNAL_TYPES = [
    "css",
    "less",
    "sass",
    "scss",
    "styl",
    "stylus",
    "pcss",
    "postcss",
    "vue",
    "svelte",
    "marko",
    "astro",
    "png",
    "jpe?g",
    "gif",
    "svg",
    "ico",
    "webp",
    "avif",
];

export const BARE_IMPORT_RE = /^[\w@][^:]/;

// 预构建产物默认存放在 node_modules 中的 .m-vite 目录中
export const PRE_BUNDLE_DIR = path.join("node_modules", ".m-vite/deps_temp");

export const JS_TYPES_RE = /\.(?:j|t)sx?$|\.mjs$/;
export const QEURY_RE = /\?.*$/s;
export const HASH_RE = /#.*$/s;
export const DEFAULT_EXTERSIONS = [".tsx", ".ts", ".jsx", "js"];
export const HMR_PORT = 24678;
export const CLIENT_PUBLIC_PATH = "/@m-vite/client";
export const CSS_LANGS_RE = /\.(css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;

// 默认读取的配置文件名称
export const DEFAULT_CONFIG_FILES = [
    'vite.config.js',
    'vite.config.ts',
    // 'vite.config.mjs',
    // 'vite.config.cjs',
    // 'vite.config.mts',
    // 'vite.config.cts',
]

// 默认文件后缀
export const DEFAULT_EXTENSIONS = [
    '.mjs',
    '.js',
    '.mts',
    '.ts',
    '.jsx',
    '.tsx',
    '.json',
]

// 默认启动端口
export const DEFAULT_DEV_PORT = 3000;

export const OPTIMIZABLE_ENTRY_RE = /\.[cm]?[jt]s$/