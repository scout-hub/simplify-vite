/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:32:12
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-12 19:00:02
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
    { ws, moduleGraph }: ServerContext
): void => {
    if (!mod) {
        console.log(yellow(`no update happened `) + blue(file));
        return;
    }
    // 是否需要全量刷新
    let needFullReload = false;
    const boundaries = new Set<{
        boundary: ModuleNode,
        acceptedVia: ModuleNode
    }>();
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
            ...[...boundaries].map(({ boundary, acceptedVia }) => ({
                type: `${boundary.type}-update`,
                timestamp: Date.now(),
                path: boundary.url,
                acceptedPath: acceptedVia.url,
            }))
        ],
    });
}

const propagateUpdate = (
    node: ModuleNode,
    boundaries: Set<{
        boundary: ModuleNode,
        acceptedVia: ModuleNode
    }>
) => {
    // 接受自身更新是不需要全量刷新的
    if (node.isSelfAccepting) {
        // 添加边界信息
        boundaries.add({
            boundary: node,
            acceptedVia: node,
        });
        return false;
    }
    // 已经达到顶层模块
    if (!node.importers.size) return true;
    // 向上查找父模块的接受状态
    for (const importer of node.importers) {
        // 父模块中有接收自身更新的情况，需要把父模块添加到边界中
        if (importer.acceptedHmrDeps.has(node)) {
            boundaries.add({
                boundary: importer,
                acceptedVia: node,
            });
            continue;
        }
        if (propagateUpdate(importer, boundaries)) return true;
    }
    return false;
}

const enum LexerState {
    inCall,
    inSingleQuoteString,
    inDoubleQuoteString,
    inTemplateString,
    inArray,
}

export function lexAcceptedHmrDeps(
    code: string,
    start: number,
    urls: Set<{ url: string; start: number; end: number }>,
): boolean {
    let state: LexerState = LexerState.inCall
    // the state can only be 2 levels deep so no need for a stack
    let prevState: LexerState = LexerState.inCall
    let currentDep: string = ''

    function addDep(index: number) {
        urls.add({
            url: currentDep,
            start: index - currentDep.length - 1,
            end: index + 1,
        })
        currentDep = ''
    }

    for (let i = start; i < code.length; i++) {
        const char = code.charAt(i)
        switch (state) {
            case LexerState.inCall:
            case LexerState.inArray:
                if (char === `'`) {
                    prevState = state
                    state = LexerState.inSingleQuoteString
                } else if (char === `"`) {
                    prevState = state
                    state = LexerState.inDoubleQuoteString
                } else if (char === '`') {
                    prevState = state
                    state = LexerState.inTemplateString
                } else if (/\s/.test(char)) {
                    continue
                } else {
                    if (state === LexerState.inCall) {
                        if (char === `[`) {
                            state = LexerState.inArray
                        } else {
                            // reaching here means the first arg is neither a string literal
                            // nor an Array literal (direct callback) or there is no arg
                            // in both case this indicates a self-accepting module
                            return true // done
                        }
                    } else if (state === LexerState.inArray) {
                        if (char === `]`) {
                            return false // done
                        } else if (char === ',') {
                            continue
                        }
                    }
                }
                break
            case LexerState.inSingleQuoteString:
                if (char === `'`) {
                    addDep(i)
                    if (prevState === LexerState.inCall) {
                        // accept('foo', ...)
                        return false
                    } else {
                        state = prevState
                    }
                } else {
                    currentDep += char
                }
                break
            case LexerState.inDoubleQuoteString:
                if (char === `"`) {
                    addDep(i)
                    if (prevState === LexerState.inCall) {
                        // accept('foo', ...)
                        return false
                    } else {
                        state = prevState
                    }
                } else {
                    currentDep += char
                }
                break
            case LexerState.inTemplateString:
                if (char === '`') {
                    addDep(i)
                    if (prevState === LexerState.inCall) {
                        // accept('foo', ...)
                        return false
                    } else {
                        state = prevState
                    }
                } else if (char === '$' && code.charAt(i + 1) === '{') { }
                else {
                    currentDep += char
                }
                break
            default:
                throw new Error('unknown import.meta.hot lexer state')
        }
    }
    return false
}