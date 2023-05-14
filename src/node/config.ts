import path from "path";
import fs from "fs";
import { build } from 'esbuild';
import { DEFAULT_CONFIG_FILES, DEFAULT_EXTENSIONS } from "./constants";
import { isBuiltin, lookupFile } from "./utils";
import { tryNodeResolve } from "./plugins/resolve";
import { pathToFileURL } from "node:url";

/*
 * @Author: Zhouqi
 * @Date: 2023-05-12 15:39:23
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-14 22:24:32
 */
export interface UserConfig {
    root?: string,
    mode?: string
}

export interface InlineConfig extends UserConfig { }

export interface ConfigEnv {
    command: 'build' | 'serve'
    mode: string
}

/**
 * @author: Zhouqi
 * @description: 解析配置
 */
export const resolveConfig = async (
    inlineConfig: InlineConfig,
    command: 'build' | 'serve',
    defaultMode = 'development'
) => {
    // 获取构建模式，默认为development
    const { mode = defaultMode } = inlineConfig;
    const configEnv: ConfigEnv = {
        mode,
        command
    };
    // 读取配置文件
    const loadResult = await loadConfigFromFile(configEnv);
}

/**
 * @author: Zhouqi
 * @description: 读取项目中的配置文件（vite.config.ts）
 */
const loadConfigFromFile = async (configEnv: ConfigEnv, configRoot = process.cwd()) => {
    let resolvedPath;
    for (const filename of DEFAULT_CONFIG_FILES) {
        // 获取配置文件的地址
        const filePath = path.resolve(configRoot, filename);
        // 判断是否存在对应文件
        if (!fs.existsSync(filePath)) continue;
        // 只要匹配到一份配置文件就直接结束
        resolvedPath = filePath;
        break;
    }
    // 没有定义配置文件
    if (!resolvedPath) {
        console.error('未读取到配置文件');
        return null;
    }
    // 判断是否是esm模式
    let isESM = false;
    // 1. 根据配置文件名判断
    // 2. 根据package.json中的type字段判断
    try {
        const pkg = lookupFile(configRoot, ['package.json']);
        isESM = !!pkg && JSON.parse(pkg).type === 'module';
    } catch (error) { }
    const bundled = await bundleConfigFile(resolvedPath, isESM)
}

/**
 * @author: Zhouqi
 * @description: 构建解析配置文件
 */
const bundleConfigFile = async (fileName: string, isESM: boolean) => {
    // 通过esbuild分析配置文件中的依赖
    const result = await build(
        {
            // 入口文件
            entryPoints: [fileName],
            write: false,
            outfile: 'out.js',
            // 指定输出环境
            platform: 'node',
            // 生成依赖图
            metafile: true,
            format: isESM ? 'esm' : 'cjs',
            // 将所有源码打包到一起，将依赖项内联到文件本身中
            bundle: true,
            plugins: [
                {
                    name: 'externalize-deps',
                    setup(build) {
                        const options = {
                            root: path.dirname(fileName),
                            isBuild: true,
                            isProduction: true,
                            preferRelative: false,
                            tryIndex: true,
                            mainFields: [],
                            browserField: false,
                            conditions: [],
                            overrideConditions: ['node'],
                            dedupe: [],
                            extensions: DEFAULT_EXTENSIONS,
                            preserveSymlinks: false,
                        };
                        build.onResolve({ filter: /^[^.].*/ },
                            async ({ path: id, importer, kind }) => {
                                // 是否是入口资源，或者是不是绝对地址的资源，或者是否是内部资源
                                if (
                                    kind === 'entry-point' ||
                                    path.isAbsolute(id) ||
                                    isBuiltin(id)
                                ) return;
                                // 是否是esm模式或者动态import的资源
                                const isIdESM = isESM || kind === 'dynamic-import';
                                // 根据id去找资源路径
                                let idFsPath = tryNodeResolve(id, importer, { ...options }, false)?.id;
                                if (idFsPath && isIdESM) {
                                    idFsPath = pathToFileURL(idFsPath).href;
                                }
                                return {
                                    path: idFsPath,
                                    external: true,
                                };
                            });
                    }
                },
                {
                    name: 'inject-file-scope-variables',
                    setup(build) {
                        build.onLoad({ filter: /\.[cm]?[jt]s$/ },
                            async (args) => {
                                const contents = await fs.promises.readFile(args.path, 'utf8');
                                return {
                                    loader: args.path.endsWith('ts') ? 'ts' : 'js',
                                    contents,
                                };
                            });
                    }
                }]
        }
    );
    // 只有write未false才会有outputFiles
    const { text } = result.outputFiles[0];
    return {
        code: text,
        dependencies: result.metafile ? Object.keys(result.metafile.inputs) : []
    }
};