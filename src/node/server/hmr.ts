/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:32:12
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-26 16:18:54
 */
import { ServerContext } from "./index";
import { blue, green, yellow } from "picocolors";
import { getShortName } from "../utils";
import { ModuleNode } from "./ModuleGraph";

/**
 * @author: Zhouqi
 * @description: 绑定热更新事件
 */
export const bindingHMREvents = (serverContext: ServerContext) => {
    const { watcher } = serverContext;

    watcher.on("change", async (file) => {
        const { moduleGraph } = serverContext;
        // 清除模块依赖图中的缓存
        await moduleGraph.invalidateModule(file);
        // 向客户端发送更新信息
        await handleHMRUpdate(file, serverContext);
    });
}

/**
 * @author: Zhouqi
 * @description: 处理热更新
 */
const handleHMRUpdate = async (file: string, serverContext: ServerContext) => {
    const { config, moduleGraph } = serverContext;
    const shortFile = getShortName(file, config.root);
    // 是否是配置文件有改动
    const isConfig = file === config.configFile;
    if (isConfig) {
        // 重启服务
        console.log(`${blue("[config change]")} ${green(shortFile)}`);
        // todo 服务重启
        return;
    }
    const mod = moduleGraph.getModuleById(file);
    console.log(`✨${blue("[hmr]")} ${green(shortFile)} changed`);
    updateModules(file, mod, serverContext);

}
export const updateModules = (
    file: string,
    mod: ModuleNode | undefined,
    { ws, moduleGraph, root }: ServerContext
): void => {
    if (!mod) {
        console.log(yellow(`no update happened `) + blue(file));
        return;
    }
    // 是否需要全量刷新
    // let needFullReload = false;
    moduleGraph.invalidateModule(mod.id!);
    // 没有引用该模块的模块，所以该模块可以认为是根模块，根模块改变需要全量刷新
    // if (!mod.importers.size) needFullReload = true;
    // if (needFullReload) {
    //     ws.send({
    //         type: 'full-reload',
    //     });
    //     return;
    // }
    ws.send({
        type: "update",
        updates: [
            {
                type: "js-update",
                timestamp: Date.now(),
                path: "/" + getShortName(file, root),
                acceptedPath: "/" + getShortName(file, root),
            },
        ],
    });
}