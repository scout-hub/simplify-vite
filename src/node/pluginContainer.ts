/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:28:44
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-16 16:38:56
 */
import type {
    LoadResult,
    PartialResolvedId,
    SourceDescription,
    PluginContext as RollupPluginContext,
    ResolvedId,
} from "rollup";

import { join } from "node:path";

export interface PluginContainer {
    resolveId(id: string, importer?: string): Promise<PartialResolvedId | null>;
    load(id: string): Promise<LoadResult | null>;
    transform(code: string, id: string): Promise<SourceDescription | null>;
}

// rollup 插件机制
export const createPluginContainer = (config: Record<string, any>): PluginContainer => {
    const { plugins, root } = config;
    // 插件上下文对象
    // @ts-ignore 这里仅实现上下文对象的 resolve 方法
    class Context implements RollupPluginContext {
        async resolve(id: string, importer?: string) {
            let out = await pluginContainer.resolveId(id, importer);
            if (typeof out === "string") out = { id: out };
            return out as ResolvedId | null;
        }
    }
    // 插件容器
    const pluginContainer: PluginContainer = {
        async resolveId(id: string, importer: string = join(root, 'index.html')) {
            const ctx = new Context() as any;
            for (const plugin of plugins) {
                if (!plugin.resolveId) continue;
                const newId = await plugin.resolveId.call(ctx as any, id, importer);
                // 如果匹配到一个则直接返回
                if (newId) {
                    id = typeof newId === "string" ? newId : newId.id;
                    return { id };
                }
            }
            return null;
        },
        async load(id) {
            const ctx = new Context() as any;
            for (const plugin of plugins) {
                if (plugin.load) {
                    const result = await plugin.load.call(ctx, id);
                    if (result) {
                        return result;
                    }
                }
            }
            return null;
        },
        async transform(code, id) {
            const ctx = new Context() as any;
            for (const plugin of plugins) {
                if (plugin.transform) {
                    const result = await plugin.transform.call(ctx, code, id);
                    if (!result) continue;
                    if (typeof result === "string") {
                        code = result;
                    } else if (result.code) {
                        code = result.code;
                    }
                }
            }
            return { code };
        },
    };

    return pluginContainer;
};