/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-07 16:47:56
 */
import { scanImports } from "./scan";
import {
    initDepsOptimizerMetadata,
    runOptimizeDeps,
    getOptimizedDepPath,
    addOptimizedDepInfo,
    extractExportsData,
    DepsOptimizer,
    OptimizedDepInfo,
    isOptimizedDepFile,
    createIsOptimizedDepUrl,
    newDepOptimizationProcessing,
    loadCachedDepOptimizationMetadata,
} from '.'
import {
    ResolvedConfig,
    getDepOptimizationConfig

} from "../config";
import { green } from "picocolors";

/**
 * @author: Zhouqi
 * @description: 初始化依赖优化
 */
export const initDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    createDepsOptimizer(config, server);
};

const depsOptimizerMap = new WeakMap<ResolvedConfig, DepsOptimizer>();

/**
 * @author: Zhouqi
 * @description: 创建预构建依赖优化
 */
const createDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    let postScanOptimizationResult: Promise<any> | undefined;
    // 读取缓存的metadata json文件
    const cachedMetadata = loadCachedDepOptimizationMetadata(config);
    // 如果没有获取到缓存预构建依赖的信息则去创建
    let metadata = cachedMetadata || initDepsOptimizerMetadata(config);

    let handle: NodeJS.Timeout | undefined;

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

    // 如果没有缓存或者它已经过时，我们需要准备第一次运行

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

    /**
     * @author: Zhouqi
     * @description: 注册缺失的import依赖
     */
    function registerMissingImport(
        id: string,
        resolved: string,
    ): OptimizedDepInfo {
        const optimized = metadata.optimized[id];
        if (optimized) return optimized;
        const chunk = metadata.chunks[id];
        if (chunk) return chunk;
        let missing = metadata.discovered[id];
        // 已经发现了这个缺失的依赖，它将在下一次重新运行时处理
        if (missing) return missing;
        // 添加缺失的依赖
        missing = addMissingDep(id, resolved);
        return missing;
    }

    // 添加缺失的依赖信息
    function addMissingDep(id: string, resolved: string) {
        return addOptimizedDepInfo(metadata, 'discovered', {
            id,
            file: getOptimizedDepPath(id, config),
            src: resolved,
            processing: depOptimizationProcessing.promise,
            exportsData: extractExportsData(resolved, config),
        });
    }

    async function optimizeNewDeps() {
        const knownDeps = prepareKnownDeps();
        return await runOptimizeDeps(config, knownDeps);
    }

    // 记录已经注册过的依赖
    let registeredIds: { id: string, done: () => Promise<any> }[] = []
    // 记录已经处理过的依赖
    let seenIds = new Set<string>();
    let waitingOn: string | undefined;

    // 延迟依赖优化直到条件满足
    function delayDepsOptimizerUntil(id: string, done: () => Promise<any>): void {
        // 运行过程中发现的依赖，非预构建阶段发现的依赖
        if (!depsOptimizer.isOptimizedDepFile(id) && !seenIds.has(id)) {
            seenIds.add(id)
            registeredIds.push({ id, done })
            // 空闲时进行优化处理
            runOptimizerWhenIdle();
        }
    }

    // 空闲时进行优化处理
    function runOptimizerWhenIdle() {
        // 是否已经有在进行处理的依赖
        if (!waitingOn) {
            const next = registeredIds.pop();
            if (next) {
                waitingOn = next.id;
                const afterLoad = () => {
                    waitingOn = undefined;
                    registeredIds.length > 0 ? runOptimizerWhenIdle() : onCrawlEnd();
                };
                next
                    .done()
                    .then(
                        () => setTimeout(
                            afterLoad,
                            registeredIds.length > 0 ? 0 : 100,
                        )
                    )
                    .catch(afterLoad);
            }
        }
    }

    async function onCrawlEnd() {
        // 已经不是第一次运行了，所以可以直接返回，不需要再进行接下去的预构建处理
        if (firstRunCalled) return;
        const crawlDeps = Object.keys(metadata.discovered);

        currentlyProcessing = false;
        // 保证预构建扫描以及依赖优化处理都已经完成
        await depsOptimizer.scanProcessing;

        if (postScanOptimizationResult) {
            const result = await postScanOptimizationResult;
            postScanOptimizationResult = undefined;
            const scanDeps = Object.keys(result.metadata.optimized);

            /**
             * 这种情况针对第一次进行预构建运行并且预构建中没有需要预构建的依赖的情况
             * 这种情况下需要把预构建创建的临时目录给删除并标记firstRunCalled为true
             */
            if (scanDeps.length === 0 && crawlDeps.length === 0) {
                result.cancel();
                firstRunCalled = true;
                return;
            }

            // 判断是否有缺失的依赖，如果有缺失的新依赖，则需要重新进行预构建处理
            const scannerMissedDeps = crawlDeps.some((dep) => !scanDeps.includes(dep));
            const outdatedResult = scannerMissedDeps;
            if (outdatedResult) {
                // 删除此扫描结果，并执行新的优化以避免完全重新加载
                result.cancel();
                // 重新进行预构建优化
                for (const dep of scanDeps) {
                    if (!crawlDeps.includes(dep)) {
                        addMissingDep(dep, result.metadata.optimized[dep].src);
                    }
                }
                debouncedProcessing(0);
            } else {
                runOptimizer(result);
            }
        } else {
            // 没有发现需要优化的新依赖
            if (!crawlDeps.length) {
                console.log(
                    green(
                        `✨ no dependencies found while crawling the static imports`,
                    ),
                );
                firstRunCalled = true;
            } else {
                debouncedProcessing(0);
            }
        }
    }

    function debouncedProcessing(timeout = 100) {
        // 加上防抖的效果，避免发现多个动态导入的依赖，从而频繁进行预构建处理
        if (handle) clearTimeout(handle);
        handle = setTimeout(() => {
            handle = undefined;
            if (!currentlyProcessing) {
                runOptimizer();
            }
        }, timeout);
    }

    function prepareKnownDeps() {
        const knownDeps: Record<string, OptimizedDepInfo> = {}
        // 克隆优化的信息对象
        for (const dep of Object.keys(metadata.optimized)) {
            knownDeps[dep] = { ...metadata.optimized[dep] }
        }
        for (const dep of Object.keys(metadata.discovered)) {
            const { processing, ...info } = metadata.discovered[dep]
            knownDeps[dep] = info
        }
        return knownDeps;
    }

    async function runOptimizer(preRunResult?: any) {
        // 确保不会为当前发现的 deps 发出重新运行
        if (handle) clearTimeout(handle);
        const processingResult = preRunResult ?? (await optimizeNewDeps());
        const newData = processingResult.metadata;
        const needsInteropMismatch = findInteropMismatches(metadata.discovered, newData.optimized);
        const needsReload = needsInteropMismatch.length > 0;
        // 预构建依赖优化处理完成，更新依赖缓存
        const commitProcessing = async () => {
            await processingResult.commit();
            // 更新已发现的依赖信息
            for (const o in newData.optimized) {
                const discovered = metadata.discovered[o];
                if (discovered) {
                    const optimized = newData.optimized[o];
                    discovered.needsInterop = optimized.needsInterop;
                    discovered.processing = undefined
                }
            }
            // 执行所有的预构建处理进行，将内部的promise都resolve掉
            resolveEnqueuedProcessingPromises();
        }
        if (!needsReload) {
            await commitProcessing();
        } else {
            throw new Error('needsReload');
        }
    }
}

/**
 * @author: Zhouqi
 * @description: 查找预构建依赖
 */
const discoverProjectDependencies = async (config: ResolvedConfig) => {
    // 根据import进行依赖分析，找出需要预构建的资源
    const { deps } = await scanImports(config);
    return deps;
}

/**
 * @author: Zhouqi
 * @description: 根据config配置获取预构建依赖分析对象
 */
export const getDepsOptimizer = (
    config: ResolvedConfig,
): DepsOptimizer | undefined => depsOptimizerMap.get(config);

const findInteropMismatches = (
    discovered: Record<string, OptimizedDepInfo>,
    optimized: Record<string, OptimizedDepInfo>,
) => {
    const needsInteropMismatch = []
    for (const dep in discovered) {
        const discoveredDepInfo = discovered[dep]
        const depInfo = optimized[dep]
        if (depInfo) {
            if (
                discoveredDepInfo.needsInterop !== undefined &&
                depInfo.needsInterop !== discoveredDepInfo.needsInterop
            ) {
                // 只有当发现的依赖混合了 ESM 和 CJS 语法时才会发生这种情况 
                // 并且它没有被手动添加到 optimizeDeps.needsInterop
                needsInteropMismatch.push(dep)
            }
        }
    }
    return needsInteropMismatch
}




