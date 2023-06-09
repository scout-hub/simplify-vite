/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:32:12
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-09 11:22:21
 */
import { ServerContext } from "./index";
import { blue, green, yellow } from "picocolors";
import { getShortName, normalizePath } from "../utils";
import { ModuleNode } from "./ModuleGraph";

/**
 * @author: Zhouqi
 * @description: 绑定热更新事件
 */
export const bindingHMREvents = (serverContext: ServerContext) => {
    const { watcher } = serverContext;

    watcher.on("change", async (file) => {
        file = normalizePath(file);
        // TODO：package.json文件改动
        const { moduleGraph } = serverContext;
        // 清除模块依赖图中的缓存
        await moduleGraph.onFileChange(file);
        // 向客户端发送更新信息
        await handleHMRUpdate(file, serverContext);
    });

    watcher.on("add", async (file) => {
        console.log('add');
    });

    watcher.on("unlink", async (file) => {
        console.log('unlink');
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
    let needFullReload = false;
    const boundaries = new Set<{ boundary: ModuleNode }>();
    const hasDeadEnd = propagateUpdate(mod, boundaries);
    moduleGraph.invalidateModule(mod);
    if (hasDeadEnd) needFullReload = true;
    // 是否需要全量刷新
    if (needFullReload) {
        console.log(green(`page reload `));
        ws.send({
            type: 'full-reload',
        });
        return;
    }
    ws.send({
        type: "update",
        updates: [
            ...[...boundaries].map(({ boundary }) => ({
                type: `${boundary.type}-update`,
                timestamp: Date.now(),
                path: boundary.url
            }))
        ],
    });
}

const propagateUpdate = (
    node: ModuleNode,
    boundaries: Set<{ boundary: ModuleNode }>
) => {
    // 接受自身更新是不需要全量刷新的
    if (node.isSelfAccepting) {
        // 添加边界信息
        boundaries.add({
            boundary: node,
        });
        return false;
    }
    // 已经达到顶层模块
    if (!node.importers.size) return true
    // 向上查找父模块的接受状态
    for (const importer of node.importers) {
        if (propagateUpdate(importer, boundaries)) return true;
    }
    return false;
}