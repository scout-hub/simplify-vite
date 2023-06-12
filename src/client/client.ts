
/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:33:28
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-12 19:28:51
 */
console.log("[vite] connecting...");

// 1. 创建客户端 WebSocket 实例
// 其中的 __HMR_PORT__ 之后会被 no-bundle 服务编译成具体的端口号
const socket = new WebSocket(`ws://localhost:__HMR_PORT__`, "vite-hmr");

// 2. 接收服务端的更新信息
socket.addEventListener("message", async ({ data }) => {
    handleMessage(JSON.parse(data)).catch(console.error);
});

// 3. 根据不同的更新类型进行更新
async function handleMessage(payload: any) {
    switch (payload.type) {
        case "connected":
            console.log(`[vite] connected.`);
            // 心跳检测
            // setInterval(() => socket.send("ping"), 1000);
            break;

        case "update": {
            // 进行具体的模块更新
            payload.updates.forEach(async (update: any) => {
                if (update.type === "js-update") {
                    const cb = await fetchUpdate(update);
                    // 执行热重载回调
                    cb!();
                }
            });
            break;
        }
        case "full-reload": {
            // 全量刷新
            location.reload();
            break;
        }
    }
}

interface HotModule {
    id: string;
    callbacks: HotCallback[];
}

interface HotCallback {
    deps: string[];
    fn: (modules: object[]) => void;
}

// HMR 模块表
const hotModulesMap = new Map<string, HotModule>();
// 不在生效的模块表
const pruneMap = new Map<string, (data: any) => void | Promise<void>>();

export const createHotContext = (ownerPath: string) => {
    const mod = hotModulesMap.get(ownerPath);
    if (mod) {
        mod.callbacks = [];
    }

    function acceptDeps(deps: string[], callback: any) {
        const mod: HotModule = hotModulesMap.get(ownerPath) || {
            id: ownerPath,
            callbacks: [],
        };
        // callbacks 属性存放 accept 的依赖、依赖改动后对应的回调逻辑
        mod.callbacks.push({
            deps,
            fn: callback,
        });
        hotModulesMap.set(ownerPath, mod);
    }

    return {
        accept(deps?: any, callback?: any) {
            if (typeof deps === "function" || !deps) {
                // import.meta.hot.accept()
                // 接受自身热更新
                acceptDeps([ownerPath], ([mod]: any) => deps?.(mod));
            } else if (Array.isArray(deps)) {
                acceptDeps(deps, callback);
            } else if (typeof deps === 'string') {
                acceptDeps([deps], callback);
            }
        },
        // 模块不再生效的回调
        // import.meta.hot.prune(() => {})
        prune(cb: (data: any) => void) {
            pruneMap.set(ownerPath, cb);
        },
    };
};

async function fetchUpdate({ path, timestamp, acceptedPath }: any) {
    const mod = hotModulesMap.get(path);
    if (!mod) return;
    const moduleMap = new Map();
    const [acceptedPathWithoutQuery, query] = acceptedPath.split(`?`);

    // 从 callbacks 中过滤出需要执行 accept 回调
    const qualifiedCallbacks = mod.callbacks.filter(({ deps }) =>
        deps.includes(acceptedPath),
    );
    try {
        // 通过动态 import 拉取最新模块
        const newMod = await import(
            acceptedPathWithoutQuery + `?t=${timestamp}${query ? `&${query}` : ""}`
        );
        moduleMap.set(path, newMod);
    } catch (e) { }

    return () => {
        // 拉取最新模块后执行更新回调
        for (const { deps, fn } of qualifiedCallbacks) {
            fn(deps.map((dep: any) => moduleMap.get(dep)));
        }
        console.log(`[vite] hot updated: ${path}`);
    };
}

const sheetsMap = new Map();

export function updateStyle(id: string, content: string) {
    let style = sheetsMap.get(id);
    if (!style) {
        // 添加 style 标签
        style = document.createElement("style");
        style.setAttribute("type", "text/css");
        style.innerHTML = content;
        document.head.appendChild(style);
    } else {
        // 更新 style 标签内容
        style.innerHTML = content;
    }
    sheetsMap.set(id, style);
}

export function removeStyle(id: string): void {
    const style = sheetsMap.get(id);
    if (style) {
        document.head.removeChild(style);
    }
    sheetsMap.delete(id);
}