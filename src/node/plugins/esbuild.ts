/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 15:09:25
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-05 17:27:22
 */
import { readFile } from "fs-extra";
import { Plugin } from "../plugin";
import { isJSRequest } from "../utils";
import { transform } from "esbuild";
import path from "path";

export function esbuildPlugin(): Plugin {
    return {
        name: "m-vite:esbuild",
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
                    loader: extname as "js" | "ts" | "jsx" | "tsx",
                    sourcefile: id,
                    target: "esnext",
                    format: "esm",
                    sourcemap: true,
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