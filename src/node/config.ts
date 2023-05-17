import type { OptimizeDeps } from './optimizer';
import type { BuildOptions } from './build';
import type { Plugin } from './plugin';
import path from "path";
import fs from "fs";
import { build } from 'esbuild';
import { DEFAULT_CONFIG_FILES, DEFAULT_EXTENSIONS } from "./constants";
import { dynamicImport, isBuiltin, lookupFile, mergeConfig, normalizePath } from "./utils";
import { resolvePlugin, tryNodeResolve } from "./plugins/resolve";
import { pathToFileURL } from "node:url";
import { resolveBuildOptions } from './build';
import { resolvePlugins } from './plugins';
import { PackageCache } from './packages';
import { PluginContainer, createPluginContainer } from './pluginContainer';

export type ResolveFn = (
    id: string,
    importer?: string,
) => Promise<string | undefined>

export type ResolvedConfig = Readonly<
    Omit<UserConfig, 'plugins' | 'optimizeDeps'> & {
        inlineConfig: InlineConfig
        root: string
        cacheDir: string
        command: 'build' | 'serve'
        mode: string
        plugins: readonly Plugin[]
        build: any
        optimizeDeps: any
        packageCache: PackageCache,
        createResolver: (options?: Record<string, any>) => ResolveFn
    }
>

export interface UserConfig {
    root?: string
    mode?: string
    optimizeDeps?: OptimizeDeps
    build?: BuildOptions
    plugins?: Plugin[]
    cacheDir?: string
}

export interface InlineConfig extends UserConfig { }

export interface ConfigEnv {
    command: 'build' | 'serve'
    mode: string
}

export type UserConfigFn = (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
export type UserConfigExport = UserConfig | Promise<UserConfig> | UserConfigFn;

/**
 * @author: Zhouqi
 * @description: 定义用户端的配置
 */
export function defineConfig(config: UserConfigExport): UserConfigExport {
    return config;
}

/**
 * @author: Zhouqi
 * @description: 解析配置
 */
export const resolveConfig = async (
    inlineConfig: InlineConfig,
    command: 'build' | 'serve',
    defaultMode = 'development'
): Promise<ResolvedConfig> => {
    let config = inlineConfig;
    // 获取构建模式，默认为development
    let { mode = defaultMode } = inlineConfig;
    const configEnv: ConfigEnv = {
        mode,
        command
    };
    // 读取配置文件
    const loadResult = await loadConfigFromFile(configEnv);
    if (loadResult) {
        // 合并vite默认配置和用户配置
        config = mergeConfig(loadResult.config, inlineConfig);
    }
    // --mode优先级最高，其次是用户定义的mode
    mode = inlineConfig.mode || config.mode || mode;
    configEnv.mode = mode;
    const resolvedRoot = normalizePath(config.root ? path.resolve(config.root) : process.cwd());

    // 获取vite config中的build配置
    const resolvedBuildOptions = resolveBuildOptions(config.build);

    // pathOnly = true，只返回文件路径，不读取内容
    const pkgPath = lookupFile(resolvedRoot, [`package.json`], { pathOnly: true });
    const cacheDir = normalizePath(
        config.cacheDir ?
            path.resolve(resolvedRoot, config.cacheDir) :
            path.join(path.dirname(pkgPath || ''), `node_modules/.vite`)
    );

    //创建一个用于特殊场景的内部解析器，例如优化器和处理 css @imports
    const createResolver = (options: any) => {
        let resolverContainer: PluginContainer | undefined;
        return async (id: string, importer: string | undefined) => {
            const container =
                resolverContainer ||
                (resolverContainer = await createPluginContainer({
                    ...resolved,
                    plugins: [
                        resolvePlugin({
                            root: resolvedRoot,
                            asSrc: true,
                            ...options,
                        }),
                    ],
                }));
            return (await container.resolveId(id, importer))?.id
        }
    };

    const optimizeDeps = config.optimizeDeps || {};
    const resolvedConfig: ResolvedConfig = {
        root: resolvedRoot,
        build: resolvedBuildOptions,
        cacheDir,
        mode,
        inlineConfig,
        command,
        // todo 获取vite config配置用的用户定义的userPlugins
        plugins: [],
        packageCache: new Map(),
        createResolver,
        optimizeDeps: {
            ...optimizeDeps
        }
    }
    const resolved: ResolvedConfig = {
        ...config,
        ...resolvedConfig
    };

    // 解析vite config中的plugins并合并
    (resolved.plugins as Plugin[]) = resolvePlugins(resolved);
    return resolved;
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
    // 通过esbuild构建vite config的产物
    const bundled = await bundleConfigFile(resolvedPath, isESM);
    // 通过esm或者cjs的模式加载配置文件
    const userConfig = await loadConfigFromBundledFile(resolvedPath, bundled.code, isESM);
    // vite config可以是一个函数，也可以是一个对象
    const config = await (typeof userConfig === 'function'
        ? userConfig(configEnv)
        : userConfig);
    return {
        path: normalizePath(resolvedPath),
        config,
        dependencies: bundled.dependencies,
    };
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

/**
 * @author: Zhouqi
 * @description: 通过esm或者cjs的模式加载配置文件 
 */
const loadConfigFromBundledFile = async (
    fileName: string,
    bundledCode: string,
    isESM: boolean
) => {
    // 通过node --experimental-modules 可以支持原生ESM
    // 将构建后的config文件写入磁盘并通过node原生ESM加载配置，然后删除文件
    if (isESM) {
        const fileBase = `${fileName}.timestamp-${Date.now()}`;
        // .mjs结尾的文件说明是esm模式的
        const fileNameTmp = `${fileBase}.mjs`;
        const fileUrl = `${pathToFileURL(fileBase)}.mjs`;
        // 将构建后的产物文件写到磁盘中
        fs.writeFileSync(fileNameTmp, bundledCode);
        try {
            // 读取产物文件
            return (await dynamicImport(fileUrl)).default;
        }
        finally {
            // 删除产物文件
            fs.unlinkSync(fileNameTmp);
        }
    }
};