# vite核心原理（三）—— 插件体系

### 该部分解析基于我们实现的简单vite中的代码，是vite源码的阉割版，希望用最简洁的代码来了解vite的核心原理。其中大部分逻辑和结构都和源码保持一致，方便阅读源代码。

### vite是一套双引擎的架构体系，开发模式下使用esbuild，而生产环境使用rollup进行打包。为了能够兼容这种双系统架构，vite在设计插件时也必须考虑兼容rollup的插件体系，毕竟在生产环境下用的是rollup。因此，在开发模式下，vite模拟了rollup的插件机制，构造出了一个PluginContainer对象来调度vite插件。

### vite的PluginContainer是基于https://github.com/preactjs/wmr/blob/main/packages/wmr/src/lib/rollup-plugin-container.js重构实现的，主要分为两部分：

- ### 实现context上下文对象

- ### 实现类似rollup插件钩子的调度



### 1. Context上下文

在rollup插件中可以使用this.resolve等诸多上下文方法，这些方法都被绑定到this上，而这个this其实就是上下文对象Context（https://rollupjs.org/plugin-development/#plugin-context）。这我们的阉割版vite中暂时只需要实现一个resolve方法即可，这个resolve方法内部会调用pluginContainer的resolveId方法进行路径解析。

```typescript
// node/server/pluginContainer.ts
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
 }
```



### 2. 插件钩子的调度

这里先介绍一下rollup插件钩子的几种常见类型：

- Aysnc：异步钩子，可以写异步逻辑
- Sync：同步钩子，不能写异步逻辑
- Parallel：并发钩子，类似于通过promise.all执行多个钩子函数
- Sequential：串行钩子，当多个插件之间互相依赖时使用，即后一个插件依赖前一个插件的解析结果
- First：优先钩子，多个该类型的钩子依次执行，直到其中一个钩子返回的结果不是null或者undefiend就结束，不再执行后续钩子

某一个钩子函数可以拥有多种类型，比如load钩子，它是一种Async+First类型的钩子。下面分析几个我们要用到的钩子函数的实现：

- resolveId（First）：路径解析钩子，一般用来解析模块的路径。这个钩子会依次执行注册了resolveId方法的插件，直到获取到路径
- load（Async+First）：资源加载钩子，利用resolveId解析得到的路径去加载模块内容。这个钩子会依次执行注册了load方法的插件，直到获取到内容
- transform（Async+Sequential）：代码转换钩子，这个钩子会依次执行注册了transform方法的插件，对加载到的资源内容进行代码转换，转换的结果会传递给下一个插件

所有钩子的执行无非就是获取到插件，循环执行插件中对应的钩子方法，针对不同类型的钩子，当获取到结果时可以选择提前结束或者将结果传递给下一个插件继续执行。

```typescript
// node/server/pluginContainer.ts
export const createPluginContainer = (config: Record<string, any>): PluginContainer => {
    const { plugins, root } = config;
    // 省略context部分的代码
  
    // 插件容器
    const pluginContainer: PluginContainer = {
        async resolveId(id: string, importer: string = join(root, 'index.html'), options: Record<string, any> = {}) {
            const ctx = new Context() as any;
            for (const plugin of plugins) {
                if (!plugin.resolveId) continue;
                const newId = await plugin.resolveId.call(ctx as any, id, importer, {
                    scan: options.scan
                });
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
                    if (isObject(result)) {
                        if (result.code) {
                            code = result.code;
                        }
                    } else {
                        code = result;
                    }
                }
            }
            return { code };
        },
    };

    return pluginContainer;
};
```

以上就是vite插件体系的简单实现，构造一个pluginContainer对象，内部实现Context上下文对象以及不同钩子的调度逻辑，后续在资源请求部分会具体介绍所有用到的插件。



