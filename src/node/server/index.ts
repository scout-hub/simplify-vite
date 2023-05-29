/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:12:35
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-26 14:35:40
 */
// connect 是一个具有中间件机制的轻量级 Node.js 框架。
// 既可以单独作为服务器，也可以接入到任何具有中间件机制的框架中，如 Koa、Express
import connect from "connect";
import path from "node:path";
import http from "node:http";
// picocolors 是一个用来在命令行显示不同颜色文本的工具
import { blue, green } from "picocolors";
import { initDepsOptimizer } from "../optimizer/optimizer";
import { createPluginContainer, PluginContainer } from "./pluginContainer";
import type { Plugin } from "../plugin";
import { createDevHtmlTransformFn, indexHtmlMiddware } from "./middlewares/indexHtml";
import { transformMiddleware } from "./middlewares/transform";
import { staticMiddleware } from "./middlewares/static";
import { ModuleGraph } from "./ModuleGraph";
import chokidar, { FSWatcher } from "chokidar";
import { createWebSocketServer } from "../ws";
import { bindingHMREvents } from "./hmr";
import type { InlineConfig, ResolvedConfig } from "../config";
import { resolveConfig } from "../config";
import { httpServerStart, resolveHttpServer } from "../http";
import { DEFAULT_DEV_PORT } from "../constants";
import { resolveChokidarOptions } from "../watch";
export interface ServerContext {
    root: string;
    pluginContainer: PluginContainer;
    app: connect.Server;
    moduleGraph: ModuleGraph;
    ws: { send: (data: any) => void; close: () => void };
    watcher: FSWatcher;
    httpServer: http.Server;
    config: ResolvedConfig;
    plugins?: Plugin[];
    listen: (port?: number, isRestart?: boolean) => Promise<ServerContext>;
    transformIndexHtml(
        url: string,
        html: string,
        originalUrl?: string,
    ): Promise<string>
}

/**
 * @author: Zhouqi
 * @description: 创建dev服务
 */
export const createServer = async (inlineConfig: InlineConfig = {}) => {
    // 解析默认配置
    const config: ResolvedConfig = await resolveConfig(inlineConfig, 'serve');
    const { root, plugins, server: serverConfig } = config;
    const startTime = Date.now();
    const app = connect() as any;
    const httpServer = await resolveHttpServer(app);
    const pluginContainer = createPluginContainer(config);
    // 创建模块依赖图
    const moduleGraph = new ModuleGraph((url) => pluginContainer.resolveId(url));
    // 获取文件监听配置
    const resolvedWatchOptions = resolveChokidarOptions(config, {
        disableGlobbing: true,
        ...serverConfig.watch,
    });

    const watcher = chokidar.watch(path.resolve(root), resolvedWatchOptions);
    // WebSocket 对象
    const ws = createWebSocketServer(app);
    // 本地服务配置

    const serverContext: ServerContext = {
        config,
        root,
        app,
        pluginContainer,
        moduleGraph,
        ws,
        watcher,
        httpServer,
        async listen(port?: number) {
            await startServer(serverContext, port)
            console.log(
                green("🚀 No-Bundle 服务已经成功启动!"),
                `耗时: ${Date.now() - startTime}ms`
            );
            console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
            return serverContext;
        },
        transformIndexHtml: null!
    };
    serverContext.transformIndexHtml = createDevHtmlTransformFn(serverContext);

    bindingHMREvents(serverContext);
    if (plugins) {
        for (const plugin of plugins) {
            if (plugin.configureServer) {
                await plugin.configureServer(serverContext);
            }
        }
    }

    // 注册中间件
    app.use(indexHtmlMiddware(serverContext));
    app.use(transformMiddleware(serverContext));
    app.use(staticMiddleware(serverContext.root));

    let initingServer: Promise<void> | undefined;
    let serverInited = false;

    // 初始化服务
    const initServer = async () => {
        if (serverInited) return;
        if (initingServer) return initingServer;
        initingServer = (async () => {
            await initDepsOptimizer(config, serverContext);
            initingServer = undefined;
            serverInited = true;
        })();
        return initingServer;
    };
    if (httpServer) {
        const listen = httpServer.listen.bind(httpServer);
        httpServer.listen = (async (port: number = 3000, ...args: any[]) => {
            await initServer();
            return listen(port, ...args)
        }) as any;
    }
    return serverContext;
}

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