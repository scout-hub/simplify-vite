# vite核心原理（四）—— 模块依赖图



### 该部分解析基于我们实现的简单vite中的代码，是vite源码的阉割版，希望用最简洁的代码来了解vite的核心原理。其中大部分逻辑和结构都和源码保持一致，方便阅读源代码。

### vite在开发模式下构建了模块依赖图ModuleGraph，模块依赖图可以很方便地用来管理各个模块之前的依赖关系，也是vite实现轻量快速的热更新的秘密。



### 1. 定义模块依赖图

这里会介绍ModuleGraph中几个需要关注的属性和方法：

- urlToModuleMap：原始请求的url到模块的映射（/src/main.tsx）
- idToModuleMap：资源id/绝对路径到模块的映射，这个id是由resolveId解析得到（/Users/scout/Documents/frontEnd/vite-source-code/vite-react-study/src/main.tsx）
- getModuleById：根据资源id获取对应模块信息
- ensureEntryFromUrl：创建模块依赖节点并更新模块依赖图
- updateModuleInfo：绑定模块依赖关系
- invalidateModule：清除模块缓存信息

```typescript
// node/server/ModuleGraph.ts
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
     * @description: 确保模块成功加载后该能够在模块依赖图中
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
     * @description: 绑定模块依赖关系
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

```

模块依赖图是由各个模块依赖节点组成，这个依赖节点就是ModuleNode：

- url：资源访问的url
- id：资源id/绝对路径
- importers：存储引用当前模块节点的模块信息（被谁引用了）
- importedModules：当前模块依赖的模块（引用谁了）
- transformResult：当前模块代码转化的结果
- lastHMRTimestamp：上一次热更新的时间
- isSelfAccepting：是否接受自身热更新

```typescript
// node/server/ModuleGraph.ts
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
    constructor(url: string) {
        this.url = url;
    }
}
```



### 2. 初始化模块依赖图实例

vite在调用createServer启动dev服务时，会在内部初始化模块依赖图的实例，并且将模块依赖图实例绑定到服务上下文中

```typescript
// /node/server/index.ts
export const createServer = async (inlineConfig: InlineConfig = {}) => {
  // 省略其它代码
	const moduleGraph: ModuleGraph = new ModuleGraph((url) =>
  	container.resolveId(url)
	);
  const serverContext: ServerContext = {
    moduleGraph
    // 省略其它属性
  };
  // 省略其它代码
}
```



### 3. 创建模块节点

vite会在模块代码转换阶段创建模块节点并更新模块依赖图，核心转换代码在transform里面，这个方法具体会在资源请求章节介绍，这里先简单提一下

```typescript
// node/server/transformRequest.ts
const loadAndTransform = async (
    id: string,
    url: string,
    server: ServerContext,
) => {
    // 省略其它代码
    const mod = await moduleGraph.ensureEntryFromUrl(url);
    // 拿到转换的结果
    const transformResult = await pluginContainer.transform(
            code as string,
            id
        );
    // 缓存模块转换结果
    mod && (mod.transformResult = transformResult);
    return transformResult;
}
```

这里主要看看ensureEntryFromUrl是如何创建模块节点的：

1. 调用插件的resolveId方法获取资源url
2. 根据url获取模块节点，如果节点存在则直接返回节点，否则根据url创建一个新的节点并更新模块依赖图信息

```typescript
// node/server/transformRequest.ts
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
```



### 4. 绑定模块依赖关系

在资源import分析阶段会绑定模块之间依赖关系，具体绑定过程由updateModuleInfo方法实现。该插件的具体逻辑会在后续资源请求部分介绍，这里主要关注updateModuleInfo方法：

1. 根据新的依赖绑定依赖关系
2. 根据旧的依赖信息删除不需要的依赖

```typescript
// node/plugins/importAnalysis.ts
export function importAnalysisPlugin(config: ResolvedConfig): Plugin {
    // 省略其它代码
    return {
        name: "m-vite:import-analysis",
        // 省略其它代码
        async transform(code: string, importer: string) {
	          // 省略其它代码
            // 处理非css资源的模块依赖图，css的依赖关系由css插件内部处理
            if (!isCSSRequest(importer)) await moduleGraph.updateModuleInfo(importerModule, importedUrls);
         	  // 省略其它代码
        },
    };
}

 // node/server/ModuleGraph.ts
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
```



以上便是模块依赖图的简单概念，当然其中还有部分跟HMR相关的逻辑，该部分逻辑后续会跟HMR章节一起介绍

