# vite核心原理（二）—— 预构建优化



### 该部分解析基于我们实现的简单vite中的代码，是vite源码的阉割版，希望用最简洁的代码来了解vite的核心原理。其中大部分逻辑和结构都和源码保持一致，方便阅读源代码。



### 为什么说vite需要进行预构建：

### 1. Vite 在开发阶段是基于浏览器对原生 ESM 的支持实现了`no-bundle`服务。无论是项目主体还是第三方包都应该符合ESM规范，但是vite无法控制第三方包的产物规范。目前还是有很多第三方包是没有ESM产物的，比如著名的react框架。因此，对于这些不支持ESM的包需要进行处理，转换成ESM的产物。

### 2. 请求瀑布流问题，这个问题的典型例子就是lodash-es这个库。当使用lodash-es中的某个方法时，这个方法内部可能依赖了其它很多文件，这些文件都是通过import的方式导入的。如果依赖足够深，足够广，那么浏览器就会发起大量请求，而浏览器对http请求的并发数也是有限制的，这会导致浏览器加载十分缓慢，因此需要对这些分散的依赖进行统一打包输出为一个文件，这样就只需要发一起一次请求即可。



在上文本地服务与配置解析内容的结尾中提到，vite对原生http对象的listen方法进行了扩展（initServer），initServer中有一段逻辑initDepsOptimizer(config, serverContext)，这个就是预构建优化的入口函数。

```typescript
// node/server/index.ts
export const createServer = () => {
	  const initServer = async () => {
        if (serverInited) return;
        if (initingServer) return initingServer;
        initingServer = (async () => {
            // 进行预构建
            await initDepsOptimizer(config, serverContext);
            initingServer = undefined;
            serverInited = true;
        })();
        return initingServer;
    };
}
```

经过简化后的initDepsOptimizer的逻辑比较简单，只有一个createDepsOptimizer方法的调用，接下去分析createDepsOptimizer函数。

```typescript
// node/optimizer/optimizer.ts
export const initDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    createDepsOptimizer(config, server);
};
```

- 第一步：读取缓存的_metadata.json文件。vite在预构建优化中，会将分析优化的产物输出到对应的cacheDir目录下的deps目录中，这个cacheDir可以由用户去配置，默认为/node_modules/vite。预构建产物中包含 _metadata.json文件，这个文件记录预构建产物的信息 —— loadCachedDepOptimizationMetadata
- 第二步：判断缓存的metadata文件是否存在，不存在说明是第一次进行预构建优化，因此需要初始化一个预构建的元信息对象  —— initDepsOptimizerMetadata
- 第三步：创建优化器对象depsOptimizer并存到全局的depsOptimizerMap中，这个对象上存储着预构建产物信息和相关操作方法
- 第四步：创建一个预构建处理任务对象，其实就是一个包含promise实例和resolve方法的对象，这个promise的作用是确保在获取预构建产物之前预构建已经完成。只有当预构建完成后才会执行resolveEnqueuedProcessingPromises方法，将等待中的promise全部resolve，之后才能进行接下去的产物获取过程 —— newDepOptimizationProcessing
- 第五步：增加控制变量currentlyProcessing和firstRunCalled。

  currentlyProcessing：标记是否正在进行预构建任务，预构建不一定是在第一次启动服务的时候才会执行，在浏览器访问资源的时候也有可能会发生多次预构建，这样就会发起多个任务。在第四步里面提到，浏览器要访问预构建资源时必须要等到预构建任务完成。因此，如果这种预构建任务过多会阻塞资源的获取，浏览器会长时间处于loading状态。这种短时间多次执行相同操作的解决方式也很常见，比如防抖、节流，或者用一个变量控制，当任务处于执行状态时，后续任务不再执行，这里的currentlyProcessing就有类似作用

  firstRunCalled：标记是否已经运行过一次程序，这个运行是指通过浏览器去访问程序

- 第六步：如果缓存的metadata存在说明已经进行过预构建，不再执行启动时的预构建处理，如果不存在则进行接下去的预构建流程。首先调用discoverProjectDependencies方法获取需要进行预构建的依赖，然后将需要预构建的依赖信息存储到metadata的discovered属性中，最后调用runOptimizeDeps将需要构建的依赖交由esbuild打包并输出到缓存目录中

```typescript
// node/optimizer/optimizer.ts
const createDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
   // 读取缓存的metadata json文件
   const cachedMetadata = loadCachedDepOptimizationMetadata(config);
   // 如果没有获取到缓存预构建依赖的信息则去创建
   let metadata = cachedMetadata || initDepsOptimizerMetadata(config);
   // 依赖优化器对象
   const depsOptimizer: DepsOptimizer = {
        metadata,
        registerMissingImport,
        getOptimizedDepId: (depInfo: OptimizedDepInfo) => `${depInfo.file}`,
        delayDepsOptimizerUntil,
        isOptimizedDepFile: (id: string) => isOptimizedDepFile(id, config),
        isOptimizedDepUrl: createIsOptimizedDepUrl(config),
        options: getDepOptimizationConfig(config),
    };
    // 将预构建优化器对象存入map中
    depsOptimizerMap.set(config, depsOptimizer);
    // 这里会创建一个预构建依赖处理进程，当我们在浏览器访问一个预构建的依赖时，需要等到依赖预构建完成
    let depOptimizationProcessing = newDepOptimizationProcessing();
    const resolveEnqueuedProcessingPromises = () => {
        // 解决所有的预构建进程处理，
        // 源码中用了一个队列去管理所有的处理进程，这里先处理单个的情况
        depOptimizationProcessing.resolve()
    }
    // 标记是否正在处理静态预构建依赖分析
    let currentlyProcessing = false;
    // 根据是否读取到缓存的metadata json数据来判断是否是第一次运行
    // 如果cachedMetadata存在，说明之前已经运行过一次了
    let firstRunCalled = !!cachedMetadata;
  
    // 磁盘中缓存的metadata数据判断之前是否已经进行过预构建，如果没有则需要进入预构建流程
    if (!cachedMetadata) {
        // 进入预构建分析处理阶段
        currentlyProcessing = true;

        let deps: Record<string, string> = {};

        /**
         *  todo: 根据vite配置中的 optimizeDeps.include 信息初始化发现的 deps
         *  addManuallyIncludedOptimizeDeps
         *  toDiscoveredDependencies
         */

        // todo 开发模式下才需要扫描依赖 isBuild === false
        // 源码中开启一个定时器进行预构建依赖扫描，为了保证服务已经处于监听状态
        depsOptimizer.scanProcessing = new Promise(resolve => {
            setTimeout(async () => {
                try {
                    deps = await discoverProjectDependencies(config);
                    // 添加缺失的依赖到 metadata.discovered 中
                    for (const id of Object.keys(deps)) {
                        if (!metadata.discovered[id]) {
                            addMissingDep(id, deps[id]);
                        }
                    }
                    const knownDeps = prepareKnownDeps();
                    postScanOptimizationResult = runOptimizeDeps(config, knownDeps);
                } catch (error) {

                }
                finally {
                    resolve();
                    depsOptimizer.scanProcessing = undefined;
                }
            });
        });
    }
}
```

这里对上述步骤中的关键方法进行解析，首先是第一步读取缓存的loadCachedDepOptimizationMetadata方法。

1. 判断cacheDir目录下是否存在metadata文件，在vite2.9之前，依赖是直接存在cacheDir目录下的，不是在cacheDir目录下的deps目录中，这里会对之前的结构进行处理
2. 调用getDepsCacheDir获取缓存目录，也就是cacheDir的值拼接上默认的deps，默认状态下为/node_modules/vite/deps
3. 生成缓存目录，默认为/node_modules/.m-vite/deps/_metadata.json，然后通过node fs模块读取文件内容并调用parseDepsOptimizerMetadata方法将读取到的进行处理，转化为内部的metadata json对象并返回结果

```typescript
// node/optimizer/index.ts
export const loadCachedDepOptimizationMetadata = (config: ResolvedConfig)
: DepOptimizationMetadata | undefined => {
    // 在 Vite 2.9 之前，依赖缓存在 cacheDir 的根目录中。为了兼容，如果我们找到旧的结构，我们会移除缓存
    if (fs.existsSync(path.join(config.cacheDir, '_metadata.json'))) emptyDir(config.cacheDir);
    // 获取缓存目录
    const depsCacheDir = getDepsCacheDir(config);
    let cachedMetadata;
    try {
        // 定义缓存文件  /node_modules/.m-vite/deps/_metadata.json
        const cachedMetadataPath = path.join(depsCacheDir, '_metadata.json');
        // 读取缓存的meta json文件
        cachedMetadata = parseDepsOptimizerMetadata(fs.readFileSync(cachedMetadataPath, 'utf-8'), depsCacheDir);
        if (cachedMetadata) return cachedMetadata;
    }
    catch (e) { }
    return cachedMetadata;
};
```

initDepsOptimizerMetadata：初始化一个metadata数据，定义我们需要用到的属性，源码中还有一些其它属性，比如文件指纹等等。

```typescript
// node/optimizer/index.ts
export const initDepsOptimizerMetadata = (
    config: ResolvedConfig,
    timestamp?: string,
): DepOptimizationMetadata => {
 // 省略其他属性
    return {
        optimized: {},
        chunks: {},
        discovered: {},
        depInfoList: [],
    }
};
```

第二步中的newDepOptimizationProcessing：创建一个promise，返回一个包含这个promise和resolve的对象

```typescript
// node/optimizer/index.ts
export function newDepOptimizationProcessing(): DepOptimizationProcessing {
    let resolve: () => void
    const promise = new Promise((_resolve) => {
        resolve = _resolve
    }) as Promise<void>
    return { promise, resolve: resolve! }
}
```

第六步中的discoverProjectDependencies：这是预构建依赖扫描的入口函数，内部调用了scanImports进行依赖扫描：

1. 获取config配置中获取依赖分析的入口文件，优先选取config.optimizeDeps.entries，其次是build.rollupOptions.input，如果没有配置则读取项目根目录下的html文件，默认情况下其实就是index.html
2. 获取预构建依赖扫描插件，执行esbuild的build方法。这部分执行的关键就是预构建依赖扫描插件 —— esbuildScanPlugin

```typescript
// node/optimizer/optimizer.ts
const discoverProjectDependencies = async (config: ResolvedConfig) => {
    // 根据import进行依赖分析，找出需要预构建的资源
    const { deps } = await scanImports(config);
    return deps;
}

// node/optimizer/scan.ts
export const scanImports = async (config: Record<string, any>): Promise<{ deps: Record<string, string> }> => {
    /**
     * 如果不配置build.rollupOptions.input或者config.optimizeDeps.entries
     * vite默认会从index.html中扫描依赖
     * 
     * 扫描优先级最高的为config.optimizeDeps.entries，其次是build.rollupOptions.input，最后才是默认的index.html
     */
    const explicitEntryPatterns = config.optimizeDeps.entries;
    const buildInput = config.build.rollupOptions?.input;
    let entries: string[];
    if (explicitEntryPatterns) {
        entries = await globEntries(explicitEntryPatterns, config);
    } else if (buildInput) {
        // TODO
        entries = [];
    } else {
        entries = await globEntries('**/*.html', config);
    }
    // 过滤出符合能够进行扫描的依赖
    entries = entries.filter(item => isScannable(item) && fs.existsSync(item));
    if (!entries.length) {
        return {
            deps: {}
        };
    }
  
    let deps: Record<string, string> = {};
    let missing: Record<string, string> = {};

    const container = createPluginContainer(config);

    // 创建esbuild的扫描插件
    const plugin = esbuildScanPlugin(config, container, deps, missing, entries);
    // 通过esbuild预构建分析需要打包的资源存储到deps中
    await build({
        write: false,
        // 作为打包入口，可以手动书写内容
        stdin: {
            contents: entries.map((e) => `import ${JSON.stringify(e)}`).join('\n'),
            loader: 'js',
        },
        format: 'esm',
        bundle: true,
        plugins: [plugin],
    });
    return {
        deps
    };
}
```

esbuildScanPlugin是一个esbuild的插件，esbuild插件内部其实就是一个对象，这个对象需要定义name属性（插件名）和setup方法。在setup方法中接受一个参数build，通过build可以绑定一些钩子，这些钩子在esbuild执行到指定时机时会被调用，进而执行插件自定义的逻辑。

这里举几个项目中用到的钩子函数的作用：

- build.onResolve(options，callback)：控制资源路径解析。options中有两个参数，第一个是必填参数filter，值为正则（需要符合Go中正则的规范），用来过滤出对应的文件。第二个是选填参数namespace命名空间。当onResolved钩子返回的对象中指定了namespace为test，那么后续钩子中只有options指定了命名空间为test的钩子才能接着处理。
- build.onLoad(options，callback)：控制模块内容加载。参数说明同上。

esbuildScanPlugin中所需要处理的就是分析import导入的资源路径，判断路径是不是在node_modules里面或者包名是不是用户指定需要处理的（config.optimizeDeps.include），如果是就需要将这些资源存入depImports中，等待扫描完成后返回。

```typescript
// node/optimizer/scan.ts
const esbuildScanPlugin = (
    config: Record<string, any>,
    container: PluginContainer,
    depImports: Record<string, string>,
    missing: Record<string, string>,
    entries: string[],
) => {
    // 遍历过的直接缓存到seen上
    const seen = new Map<string, string | undefined>();
    const include = config.optimizeDeps?.include;
    const externalUnlessEntry = ({ path }: { path: string }) => ({
        path,
        external: !entries.includes(path),
    });
    const resolve = async (
        id: string,
        importer?: string,
        options?: Record<string, any>,
    ) => {
        const key = id + (importer && path.dirname(importer));
        if (seen.has(key)) {
            return seen.get(key);
        }
        const resolved = await container.resolveId(id, importer && normalizePath(importer), {
            // 标记预构建扫描阶段
            scan: true,
        });
        const res = resolved?.id;
        seen.set(key, res);
        return res;
    };
    return {
        name: 'vite:dep-scan',
        setup(build: any) {
              setup(build: any) {
              // 对html vue等文件处理
              build.onResolve({ filter: htmlTypesRE }, async ({ path, importer }: any) => {
                  const resolved = await resolve(path, importer);
                  return {
                      path: resolved,
                      namespace: 'html',
                  };
              });

              // 对html内容处理
              build.onLoad({ filter: htmlTypesRE, namespace: 'html' }, async ({ path }: any) => {
                  // 读取文件内容
                  let raw = fs.readFileSync(path, 'utf-8');
                  // 去除注释中的内容
                  raw = raw.replace(commentRE, '<!---->');
                  let match;
                  let js = '';
                  while ((match = scriptModuleRE.exec(raw))) {
                      const [, openTag] = match;
                      // 获取script中的src标记
                      const srcMatch = openTag.match(srcRE);
                      if (srcMatch) {
                          const src = srcMatch[1] || srcMatch[2] || srcMatch[3];
                          js += `import ${JSON.stringify(src)}\n`;
                      }
                      // 将script引入方式转换为import方式
                      js += '\nexport default {}';
                  }
                  // 通过js的方式去解析
                  return {
                      loader: 'js',
                      contents: js,
                  };
              });

              // 所有import的文件处理
              build.onResolve({
                  filter: /^[\w@][^:]/,
              }, async ({ path: id, importer }: any) => {
                  // 已经处理过的同一个资源直接返回
                  if (depImports[id]) {
                      return externalUnlessEntry({ path: id });
                  }
                  const resolved = await resolve(id, importer);
                  if (resolved) {
                      if (resolved.includes('node_modules') || include?.includes(id)) {
                          depImports[id] = resolved;
                          return externalUnlessEntry({ path: id });
                      }
                  }
              });

              // 忽略css文件
              build.onResolve({ filter: CSS_LANGS_RE }, externalUnlessEntry);

              // 其它文件处理
              build.onResolve({
                  filter: /.*/,
              }, async ({ path: id, importer }: any) => {
                  // 调用vite内部的resolve插件进行路径解析
                  const resolved = await resolve(id, importer);
                  if (resolved) {
                      return {
                          path: path.resolve(cleanUrl(resolved)),
                      };
                  }
                  return externalUnlessEntry({ path: id });
              });

              // js文件处理
              build.onLoad({
                  filter: JS_TYPES_RE,
              }, async ({ path: id }: any) => {
                  // 获取文件后缀
                  let ext = path.extname(id).slice(1);
                  // 读取文件内容
                  let contents = fs.readFileSync(id, 'utf-8');
                  // 根据文件后缀决定使用什么loader
                  const loader = ext;
                  return {
                      contents,
                      loader
                  };
              });
          }
        }
    }
};
```

最后执行第六步中最后一个方法runOptimizeDeps进行依赖构建，这个方法的执行过程大致如下：

1. 生成两份预构建输出目录，一份为最终预构建需要缓存的目录（deps），另一份是正在预构建的临时目录（deps_temp）。之所以需要两份目录是为了避免在预构建阶段发生错误时影响原先真实使用的目录，只有当预构建正常处理执行后才会去替换临时目录，将deps_temp转化为deps
2. 生成一份临时的metadata数据，用于记录本次预构建相关的依赖信息
3. 创建processingResult对象，这个对象保存了metadata数据以及最终的提交方法和取消方法。当预构建流程正常执行完成后会调用提交方法，将临时目录替换成真实目录，取消方法则对应构建异常或者需要中断构建时的处理
4. 遍历需要进行预构建的依赖，将依赖路径进行转化，例如将aaa/bbb转化为aaa_bbb的形式。这么做的原因是esbuild 生成具有最低公共祖先基础的嵌套目录输出，这是不可预测的，并且难以分析条目/输出映射。简单理解就是资源引用中如果存在/这种嵌套关系（import xxx from 'xxx/yyy'），那么生成的资源也会是这种嵌套的关系，而不是平铺的关系，vite的本意是想将产物输出为平铺的结构
5. 调用esbuild.build方法，传入预构建插件进行资源构建
6. 资源构建完成后更新metadata对象，将构建完成的依赖信息存到optimized属性中，表示已经预构建优化过的依赖，最后将metadata以json的方式写入到缓存目录中

```typescript
// node/optimizer/index.ts
export const runOptimizeDeps = async (
    resolvedConfig: ResolvedConfig,
    depsInfo: Record<string, any>,
) => {
    const config: ResolvedConfig = {
        ...resolvedConfig,
    }
    // 获取预构建依赖需要输出的目录
    const depsCacheDir = getDepsCacheDir(resolvedConfig);
    // 获取运行时的预构建依赖输出目录
    const processingCacheDir = getProcessingDepsCacheDir(resolvedConfig);
    /**
     * 创建一个临时目录，这样我们就不需要删除优化的deps，直到它们被处理。
     * 如果出现错误，这也可以避免使 deps 缓存目录处于损坏状态
     */
    fs.existsSync(processingCacheDir) ?
        emptyDir(processingCacheDir) :
        fs.mkdirSync(processingCacheDir, { recursive: true });

    // 缓存目录中的所有文件都应被识别为 ES 模块
    writeFile(path.resolve(processingCacheDir, 'package.json'), JSON.stringify({ type: 'module' }));

    const metadata: DepOptimizationMetadata = initDepsOptimizerMetadata(config);

    // 没有预构建的依赖，直接返回
    const qualifiedIds = Object.keys(depsInfo);
    if (!qualifiedIds.length) return;

    const processingResult = {
        metadata,
        async commit() {
            // 写入元数据文件，删除 `deps` 文件夹并将 `processing` 文件夹重命名为 `deps` 处理完成，
            // 我们现在可以用 depsCacheDir 替换 processingCacheDir 将文件路径从临时处理目录重新连接到最终的 deps 缓存目录
            await removeDir(depsCacheDir);
            await renameDir(processingCacheDir, depsCacheDir);
        },
        cancel() {
            // 取消预构建，删除预构建临时目录
            fs.rmSync(processingCacheDir, { recursive: true, force: true })
        }
    };

    /**
     * esbuild 生成具有最低公共祖先基础的嵌套目录输出，这是不可预测的，并且难以分析条目/输出映射。
     * 所以我们在这里做的是：
     * 1. 压平所有的ids来消除斜杠  例如react-dom/client在内部会被记录为react-dom_client
     * 2. 在插件中，我们自己读取条目作为虚拟文件来保留路径。
     */
    const flatIdDeps: Record<string, string> = {};
    const idToExports: Record<string, ExportsData> = {}
    const plugins = [];
    for (const id in depsInfo) {
        const src = depsInfo[id].src;
        const exportsData = await (depsInfo[id].exportsData ??
            extractExportsData(src, config));
        const flatId = flattenId(id);
        idToExports[id] = exportsData;
        flatIdDeps[flatId] = src;
    }
    plugins.push(esbuildDepPlugin(flatIdDeps, resolvedConfig));
    await build({
        entryPoints: Object.keys(flatIdDeps),
        bundle: true,
        format: 'esm',
        platform: 'browser',
        // build的时候会从config.build.target中获取，dev模式下用vite内部定义的值
        target: ESBUILD_MODULES_TARGET,
        splitting: true,
        sourcemap: true,
        outdir: processingCacheDir,
        plugins,
        supported: {
            'dynamic-import': true,
            'import-meta': true,
        },
    });
    for (const id in depsInfo) {
        const { exportsData, ...info } = depsInfo[id];
        // 将depsInfo中的信息添加到metadata的optimized中
        addOptimizedDepInfo(metadata, 'optimized', {
            ...info,
            needsInterop: needsInterop(idToExports[id]),
        });
    }
    const dataPath = path.join(processingCacheDir, '_metadata.json');
    writeFile(dataPath, stringifyDepsOptimizerMetadata(metadata, depsCacheDir));
    return processingResult;
};
```

至此，vite初步的预构建流程就已经完成了，对应的构建产物也都写入到了缓存目录中。
