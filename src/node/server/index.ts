/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:12:35
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-16 21:13:48
 */
// connect 是一个具有中间件机制的轻量级 Node.js 框架。
// 既可以单独作为服务器，也可以接入到任何具有中间件机制的框架中，如 Koa、Express
import connect from "connect";
import http from "node:http";
// picocolors 是一个用来在命令行显示不同颜色文本的工具
import { blue, green } from "picocolors";
import { initDepsOptimizer } from "../optimizer/optimizer";
import { createPluginContainer, PluginContainer } from "../pluginContainer";
import type { Plugin } from "../plugin";
import { indexHtmlMiddware } from "./middlewares/indexHtml";
import { transformMiddleware } from "./middlewares/transform";
import { staticMiddleware } from "./middlewares/static";
import { ModuleGraph } from "../ModuleGraph";
import chokidar, { FSWatcher } from "chokidar";
import { createWebSocketServer } from "../ws";
import { bindingHMREvents } from "../hmr";
import type { InlineConfig } from "../config";
import { resolveConfig } from "../config";
import { httpServerStart, resolveHttpServer } from "../http";
import { DEFAULT_DEV_PORT } from "../constants";
export interface ServerContext {
    root: string;
    pluginContainer: PluginContainer;
    app: connect.Server;
    moduleGraph: ModuleGraph;
    ws: { send: (data: any) => void; close: () => void };
    watcher: FSWatcher;
    httpServer: http.Server;
    config: Record<string, any>;
    plugins?: Plugin[];
    listen: (port?: number, isRestart?: boolean) => Promise<ServerContext>;
}

/**
 * @author: Zhouqi
 * @description: 创建dev服务
 */
export const createServer = async (inlineConfig: InlineConfig = {}) => {
    // 解析默认配置
    const config = await resolveConfig(inlineConfig, 'serve');
    const { root, plugins } = config;
    const startTime = Date.now();
    const app = connect() as any;
    const httpServer = await resolveHttpServer(app);
    const pluginContainer = createPluginContainer(config);
    const moduleGraph = new ModuleGraph((url) => pluginContainer.resolveId(url));

    const watcher = chokidar.watch(root, {
        ignored: ["**/node_modules/**", "**/.git/**"],
        ignoreInitial: true,
    });

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
        async listen(port?: number, isRestart?: boolean) {
            await startServer(serverContext, port, isRestart)
            // if (httpServer) {
            //     server.resolvedUrls = await resolveServerUrls(
            //         httpServer,
            //         config.server,
            //         config,
            //     )
            // }
            console.log(
                green("🚀 No-Bundle 服务已经成功启动!"),
                `耗时: ${Date.now() - startTime}ms`
            );
            console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
            return serverContext;
        },
    };

    bindingHMREvents(serverContext);

    if (plugins) {
        for (const plugin of plugins) {
            if (plugin.configureServer) {
                await plugin.configureServer(serverContext);
            }
        }
    }

    app.use(indexHtmlMiddware(serverContext));
    app.use(transformMiddleware(serverContext));
    app.use(staticMiddleware(serverContext.root));

    let initingServer: Promise<void> | undefined;
    let serverInited = false;
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
            await initServer()
            return listen(port, ...args)
        }) as any;
    }
    return serverContext;
}

async function startServer(
    server: Record<string, any>,
    inlinePort?: number,
    isRestart: boolean = false,
): Promise<void> {
    const httpServer = server.httpServer;
    const options = server.config?.server;
    const port = inlinePort ?? options?.port ?? DEFAULT_DEV_PORT;
    const serverPort = await httpServerStart(httpServer, {
        port
    });
    // const options = server.config.server
    // const port = inlinePort ?? options.port ?? DEFAULT_DEV_PORT
    // const hostname = await resolveHostname(options.host)

    // const protocol = options.https ? 'https' : 'http'

    // const serverPort = await httpServerStart(httpServer, {
    //     port,
    //     strictPort: options.strictPort,
    //     host: hostname.host,
    //     logger: server.config.logger,
    // })

    // if (options.open && !isRestart) {
    //     const path =
    //         typeof options.open === 'string' ? options.open : server.config.base
    //     openBrowser(
    //         path.startsWith('http')
    //             ? path
    //             : new URL(path, `${protocol}://${hostname.name}:${serverPort}`).href,
    //         true,
    //         server.config.logger,
    //     )
    // }
}