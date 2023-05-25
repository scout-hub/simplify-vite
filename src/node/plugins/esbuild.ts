/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:09:25
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-24 22:10:57
 */
import { readFile } from "fs-extra";
import { Plugin } from "../plugin";
import { isJSRequest } from "../utils";
import { transform } from "esbuild";
import path from "path";

export function esbuildTransformPlugin(): Plugin {
    return {
        name: "m-vite:esbuild-transform",
        // 加载模块
        async load(id) {
            if (isJSRequest(id)) {
                try {
                    const code = await readFile(id, "utf-8");
                    return code;
                } catch (e) {
                    return null;
                }
            }
        },
        async transform(code, id) {
            if (isJSRequest(id)) {
                const extname = path.extname(id).slice(1);
                const compilerOptions: Record<string, any> = {};
                if (extname === 'tsx' || extname === 'ts') {
                    compilerOptions.jsx = 'react-jsx';
                }
                const { code: transformedCode, map } = await transform(code, {
                    charset: 'utf8',
                    keepNames: false,
                    loader: extname as "js" | "ts" | "jsx" | "tsx",
                    minify: false,
                    sourcefile: id,
                    target: "esnext",
                    format: "esm",
                    sourcemap: true,
                    minifyIdentifiers: false,
                    minifySyntax: false,
                    minifyWhitespace: false,
                    treeShaking: false,
                    tsconfigRaw: {
                        compilerOptions
                    }
                });
                return {
                    code: transformedCode,
                    map,
                };
            }
            return null;
        },
    };
}