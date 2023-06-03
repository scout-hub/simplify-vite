/*
 * @Author: Zhouqi
 * @Date: 2023-02-21 16:39:56
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-03 21:45:12
 */
import { PartialResolvedId, TransformResult } from "rollup";
import { cleanUrl } from "../utils";

export class ModuleNode {
    // 资源访问 url
    url: string;
    // 资源绝对路径
    id: string | null = null;
    importers = new Set<ModuleNode>();
    importedModules = new Set<ModuleNode>();
    // 代码转换结果
    transformResult: TransformResult | null = null;
    lastHMRTimestamp = 0;
    constructor(url: string) {
        this.url = url;
    }
}

export class ModuleGraph {
    // 资源 url 到 ModuleNode 的映射表（/src/main.tsx）
    urlToModuleMap = new Map<string, ModuleNode>();
    // 资源绝对路径到 ModuleNode 的映射表（/Users/scout/Documents/frontEnd/vite-source-code/vite-react-study/src/main.tsx）
    idToModuleMap = new Map<string, ModuleNode>();

    constructor(private resolveId: (url: string) => Promise<PartialResolvedId | null>) { }

    getModuleById(id: string): ModuleNode | undefined {
        return this.idToModuleMap.get(id);
    }

    async getModuleByUrl(rawUrl: string): Promise<ModuleNode | undefined> {
        const { url } = await this._resolve(rawUrl);
        return this.urlToModuleMap.get(url);
    }

    /**
     * @author: Zhouqi
     * @description: 确保模块成功加载后该能够在模块依赖图中
     * @param {string} rawUrl
     */
    async ensureEntryFromUrl(rawUrl: string): Promise<ModuleNode> {
        const { url, resolvedId } = await this._resolve(rawUrl);
        // 首先检查缓存，缓存存在则直接返回
        if (this.urlToModuleMap.has(url)) return this.urlToModuleMap.get(url) as ModuleNode;
        // 若无缓存，创建依赖节点并更新 urlToModuleMap 和 idToModuleMap
        const mod = new ModuleNode(url);
        mod.id = resolvedId;
        this.urlToModuleMap.set(url, mod);
        this.idToModuleMap.set(resolvedId, mod);
        return mod;
    }

    /**
     * @author: Zhouqi
     * @description: 更新依赖图
     */
    async updateModuleInfo(
        mod: ModuleNode,
        importedModules: Set<string | ModuleNode>
    ) {
        const prevImports = mod.importedModules;
        for (const curImports of importedModules) {
            const dep =
                typeof curImports === "string"
                    ? await this.ensureEntryFromUrl(cleanUrl(curImports))
                    : curImports;
            // 构建双向依赖关系
            if (dep) {
                // 当前模块的importedModules中添加依赖
                mod.importedModules.add(dep);
                // 在依赖节点的importers中添加当前模块
                dep.importers.add(mod);
            }
        }
        // 清除已经不再被引用的依赖
        for (const prevImport of prevImports) {
            if (!importedModules.has(prevImport.url)) {
                prevImport.importers.delete(mod);
            }
        }
    }

    // HMR 触发时会执行这个方法
    invalidateModule(file: string) {
        const mod = this.idToModuleMap.get(file);
        if (mod) {
            // 更新时间戳
            mod.lastHMRTimestamp = Date.now();
            mod.transformResult = null;
            mod.importers.forEach((importer) => {
                this.invalidateModule(importer.id!);
            });
        }
    }

    private async _resolve(
        url: string
    ): Promise<{ url: string; resolvedId: string }> {
        const resolved = await this.resolveId(url);
        const resolvedId = resolved?.id || url;
        return { url, resolvedId };
    }
}