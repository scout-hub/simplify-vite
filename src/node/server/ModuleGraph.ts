/*
 * @Author: Zhouqi
 * @Date: 2023-02-21 16:39:56
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-12 19:28:20
 */
import { PartialResolvedId, TransformResult } from "rollup";
import { cleanUrl, removeImportQuery, removeTimestampQuery } from "../utils";
import { isDirectCSSRequest } from "../plugins/css";
import { extname } from "node:path";

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
    isSelfAccepting = false;
    acceptedHmrDeps = new Set<ModuleNode>();
    type: 'js' | 'css';
    constructor(url: string) {
        this.type = isDirectCSSRequest(url) ? 'css' : 'js'
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
        let mod = this.idToModuleMap.get(resolvedId);
        // 检查缓存
        if (!mod) {
            mod = new ModuleNode(url);
            mod.id = resolvedId;
            this.idToModuleMap.set(resolvedId, mod);
        } else if (!this.urlToModuleMap.has(url)) {
            this.urlToModuleMap.set(url, mod)
        }
        return mod;
    }

    /**
     * @author: Zhouqi
     * @description: 更新依赖图
     */
    async updateModuleInfo(
        mod: ModuleNode,
        importedModules: Set<string | ModuleNode>,
        acceptedModules: Set<string | ModuleNode>,
        isSelfAccepting: boolean,
    ) {
        mod.isSelfAccepting = isSelfAccepting;
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

        // 更新接受更新的模块
        const deps = (mod.acceptedHmrDeps = new Set());
        for (const accepted of acceptedModules) {
            const dep =
                typeof accepted === 'string'
                    ? await this.ensureEntryFromUrl(accepted)
                    : accepted
            deps.add(dep)
        }
    }

    /**
     * @author: Zhouqi
     * @description: 文件变动时清除原先模块节点缓存
     */
    onFileChange(file: string) {
        const mod = this.getModuleById(file);
        mod && this.invalidateModule(mod);
    }

    /**
     * @author: Zhouqi
     * @description: 清除模块节点缓存
     */
    invalidateModule(mod: ModuleNode) {
        // 更新时间戳
        mod.lastHMRTimestamp = Date.now();
        // 清除代码转换结果
        mod.transformResult = null;
        // 引用当前模块的模块如果不接受当前模块的更新，也需要清除缓存
        mod.importers.forEach((importer) => {
            if (!importer.acceptedHmrDeps.has(mod)) {
                this.invalidateModule(importer);
            }
        });
    }

    async _resolve(
        url: string
    ): Promise<{ url: string; resolvedId: string }> {
        const resolved = await this.resolveId(url);
        const resolvedId = resolved?.id || url;
        return { url, resolvedId };
    }

    async resolveUrl(url: string) {
        url = removeImportQuery(removeTimestampQuery(url));
        const resolved = await this.resolveId(url);
        const resolvedId = resolved?.id || url;
        // 说明可能缺少了后缀等信息
        if (url !== resolvedId) {
            const ext = extname(cleanUrl(resolvedId));
            const { pathname, search, hash } = new URL(url, 'relative://');
            if (ext && !pathname!.endsWith(ext)) {
                url = pathname + ext + search + hash;
            }
        }
        return [url, resolvedId];
    }
}