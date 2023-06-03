# vite核心原理（一）—— 本地服务及配置解析



### 该部分解析基于我们实现的简单vite中的代码，是vite源码的阉割版，希望用最简洁的代码来了解vite的核心原理。其中大部分逻辑和结构都和源码保持一致，方便阅读源代码。

当我们通过pnpm run dev的时候会启动本地开发服务，这个服务的核心入口就是createServer，通过调用createServer函数可以得到一个服务对象。这个服务对象其实就是调用node中http模块的createServer函数返回的对象。

```typescript
// node/cli.ts
import cac from "cac";

const cli = cac();
cli
    .command("[root]", "Run the development server")
    .alias("serve")
    .alias("dev")
    .action(async () => {
        const { createServer } = await import("./server");
        const server = await createServer();
        await server.listen();
    });
cli.help();
cli.parse();
```

### 1.  配置解析

进入createServer函数，第一步就是配置解析，这里的配置包括vite内部默认的配置以及用户端的自定义配置。

```typescript
// node/server/index.ts
export const createServer = async (inlineConfig: InlineConfig = {}) => {
    // 解析默认配置
    const config: ResolvedConfig = await resolveConfig(inlineConfig, 'serve');
    // ……省略其它代码
}
```

resolveConfig的简化流程如下：

- 读取用户端的配置 —— loadConfigFromFile(configEnv)
- 将vite内部默认配置和用户端的配置进行合并 —— mergeConfig(loadResult.config, inlineConfig)
- 设置mode，默认为development，如果用户在启动服务时指定了--mode命令或者在配置文件中配置了mode参数，则会应用对应的值。--mode优先级要比配置文件中的mode优先级高 —— mode = inlineConfig.mode || config.mode || mode
- 解析base配置，在开发模式下，base被限制为'/'
- 解析root配置，如果没有配置root，则默认为当前服务启动路径
- 解析build配置 —— resolveBuildOptions(config.build)
- 解析cacheDir预构建缓存目录
- 解析预构建优化相关配置
- 解析extensions配置，在导入文件时可以忽略扩展名
- 获取vite内部的插件，将vite内部的插件和用户定义的插件进行合并

```typescript
// node/config.ts
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
    let { configFile } = config
    if (loadResult) {
        configFile = loadResult.path;
        // 合并vite默认配置和用户配置
        config = mergeConfig(loadResult.config, inlineConfig);
    }
    // --mode优先级最高，其次是用户定义的mode
    mode = inlineConfig.mode || config.mode || mode;
    configEnv.mode = mode;
    const relativeBaseShortcut = config.base === '' || config.base === './';
    const isBuild = command === 'build';
    // 开发模式下默认base为/
    const resolvedBase = relativeBaseShortcut
        ? !isBuild
            ? '/'
            : './'
        : '/'
    const resolvedRoot = normalizePath(config.root ? path.resolve(config.root) : process.cwd());

    // 获取vite config中的build配置
    const resolvedBuildOptions = resolveBuildOptions(config.build);

    // pathOnly = true，只返回文件路径，不读取内容
    const pkgPath = lookupFile(resolvedRoot, [`package.json`], { pathOnly: true });
    const cacheDir = normalizePath(
        config.cacheDir ?
            path.resolve(resolvedRoot, config.cacheDir) :
            path.join(path.dirname(pkgPath || ''), `node_modules/.m-vite`)
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
            return (await container.resolveId(id, importer, {
                scan: options?.scan,
            }))?.id
        }
    };

    // TODO 解析vite config中的server配置
    const server = {};

    const resolveOptions = {
        // 导入时想忽略的扩展名
        extensions: config.resolve?.extensions ?? DEFAULT_EXTENSIONS,
    }

    // 获取预构建优化相关的配置
    const optimizeDeps = config.optimizeDeps || {};
    const resolvedConfig: ResolvedConfig = {
        configFile: configFile ? normalizePath(configFile) : undefined,
        base: resolvedBase,
        root: resolvedRoot,
        build: resolvedBuildOptions,
        cacheDir,
        resolve: resolveOptions,
        mode,
        inlineConfig,
        command,
        // todo 获取vite config配置用的用户定义的userPlugins
        plugins: [],
        packageCache: new Map(),
        createResolver,
        server,
        assetsInclude: (file: string) => DEFAULT_ASSETS_RE.test(file),
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
```

深入分析loadConfigFromFile方法：

- 第一步：根据vite内部规定的配置文件名列表（DEFAULT_CONFIG_FILES）一一去匹配文件，都没匹配到则提示错误
- 第二步：判断项目是否采用ESM模块化方式，判断依据是根据package,json中的type字段，如果type是module，那就说明是ESM模式
- 第三步：通过esbuild将配置文件进行构建处理，构建的目的也是为了对ts进行语法转换以及记录依赖，用于配置文件的热更新 —— bundleConfigFile
- 第四步：将构建生成的config配置通过写文件的方式写入到磁盘中，然后通过原生ESM或者CJS的方式读取配置内容后删除磁盘文件  —— loadConfigFromBundledFile
- 第五步：读取到的内容即为用户返回的配置，这个配置可能是个函数（defineConfig( ( )=> {} )）也可能就是一个配置对象（defineConfig( {} )）

```typescript
// node/constants.ts
const DEFAULT_CONFIG_FILES = [
    'vite.config.js',
    'vite.config.ts',
    // 'vite.config.mjs',
    // 'vite.config.cjs',
    // 'vite.config.mts',
    // 'vite.config.cts',
];
// node/config.ts
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
```



### 2. 初始化http服务

创建服务的入口函数为resolveHttpServer，这个函数的主要功能就是使用node内置http模块创建服务并返回，返回的http服务对象会被保存在服务上下文对象serverContext中。serverContext还定义了一个listen方法，这个方法会调用原生http服务上的listen方法开启服务端口监听。

并且，vite在这里对原生http服务上的listen方法做了扩展，主要扩展了预构建的流程。

```typescript
// node/server/index.ts
export const createServer = async (inlineConfig: InlineConfig = {}) => {
    // 解析默认配置
    const config: ResolvedConfig = await resolveConfig(inlineConfig, 'serve');
    const { root, plugins, server: serverConfig } = config;
    const startTime = Date.now();
    const app = connect() as any;
    // 创建http服务
    const httpServer = await resolveHttpServer(app);
    const serverContext: ServerContext = {
				// 省略其他配置
        httpServer,
        async listen(port?: number) {
            await startServer(serverContext, port)
            console.log(
                green("🚀 No-Bundle 服务已经成功启动!"),
                `耗时: ${Date.now() - startTime}ms`
            );
            console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
            return serverContext;
        }
    };
    if (httpServer) {
        // 拦截监听方法，做其它处理
        const listen = httpServer.listen.bind(httpServer);
        httpServer.listen = (async (port: number = 3000, ...args: any[]) => {
            await initServer();
            return listen(port, ...args)
        }) as any;
    }
    return serverContext;
}

// 启动服务
async function startServer(
    server: Record<string, any>,
    inlinePort?: number
): Promise<void> {
    const httpServer = server.httpServer;
    const options = server.config?.server;
    const port = inlinePort ?? options?.port ?? DEFAULT_DEV_PORT;
    await httpServerStart(httpServer, {
        port
    });
}

// node/http.ts
import http from 'node:http';
export const resolveHttpServer = async (app: http.Server) => {
    const { createServer } = await import('node:http');
    return createServer(app);
};

// 启动服务
export const httpServerStart = (httpServer: http.Server, { port }: { port: number }) => {
    return new Promise((resolve, reject) => {
        httpServer.listen(port, () => {
            resolve(port);
        });
    });
};
```

以上便是vite的本地服务以及配置解析的简单处理过程。