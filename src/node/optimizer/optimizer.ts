/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-24 16:39:43
 */
import path from "node:path";
import fs from "node:fs"
// import { build } from "esbuild";
// import { green } from "picocolors";
import { scanImports } from "./scan";
// import { preBundlePlugin } from "./esbuildDepPlugin";
// import { PRE_BUNDLE_DIR } from "../constants";
import {
    DepOptimizationMetadata,
    getDepsCacheDir,
    initDepsOptimizerMetadata,
    runOptimizeDeps,
    getOptimizedDepPath,
    addOptimizedDepInfo,
    extractExportsData,
    DepsOptimizer,
    OptimizedDepInfo,
    isOptimizedDepFile,
    createIsOptimizedDepUrl,
    newDepOptimizationProcessing
} from '.'
import { ResolvedConfig } from "../config";
import { emptyDir } from "../utils";

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

    // 依赖优化器对象
    const depsOptimizer: DepsOptimizer = {
        metadata,
        getOptimizedDepId: (depInfo: OptimizedDepInfo) => `${depInfo.file}`,
        delayDepsOptimizerUntil,
        isOptimizedDepFile: (id: string) => isOptimizedDepFile(id, config),
        isOptimizedDepUrl: createIsOptimizedDepUrl(config),
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
    let firstRunCalled = !!cachedMetadata;

    // 如果没有缓存或者它已经过时，我们需要准备第一次运行

    // 是否是第一次预构建，不存在缓存的metadata
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

    // async function optimizeNewDeps() {
    //     const knownDeps = prepareKnownDeps();
    //     return await runOptimizeDeps(config, knownDeps);
    // }

    // 记录已经注册过的依赖
    let registeredIds: { id: string, done: () => Promise<any> }[] = []
    // 记录已经处理过的依赖
    let seenIds = new Set<string>();
    let waitingOn: string | undefined;

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
        const crawlDeps = Object.keys(metadata.discovered);

        // 保证预构建扫描以及依赖优化处理都已经完成
        await depsOptimizer.scanProcessing;

        if (postScanOptimizationResult) {
            const result = await postScanOptimizationResult;
            postScanOptimizationResult = undefined;
            const scanDeps = Object.keys(result.metadata.optimized)
            // 判断是否有缺失的预构建依赖
            const needsInteropMismatch = findInteropMismatches(metadata.discovered, result.metadata.optimized);
            const scannerMissedDeps = crawlDeps.some((dep) => !scanDeps.includes(dep));
            const outdatedResult = needsInteropMismatch.length > 0 || scannerMissedDeps;
            if (outdatedResult) {

            } else {
                runOptimizer(result);
            }
        } else {
            throw new Error('!postScanOptimizationResult');
        }
    }

    function prepareKnownDeps() {
        const knownDeps: Record<string, OptimizedDepInfo> = {}
        // 克隆优化的信息对象，fileHash，browserHash 可能会为他们改变
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
        const processingResult = preRunResult;
        const newData = processingResult.metadata;
        const needsInteropMismatch = findInteropMismatches(metadata.discovered, newData.optimized);
        const needsReload = needsInteropMismatch.length > 0 ||
            Object.keys(metadata.optimized).some((dep) => {
                return (metadata.optimized[dep].fileHash !== newData.optimized[dep].fileHash);
            });
        // 预构建依赖优化处理完成，更新依赖缓存
        const commitProcessing = async () => {
            await processingResult.commit();
            // 执行所有的预构建处理进行，将内部的promise都resolve掉
            resolveEnqueuedProcessingPromises();
        }
        if (!needsReload) {
            await commitProcessing();
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
 * @description: 获取缓存的预构建依赖信息
 */
const loadCachedDepOptimizationMetadata = (config: ResolvedConfig): DepOptimizationMetadata | undefined => {
    // 在 Vite 2.9 之前，依赖缓存在 cacheDir 的根目录中。为了兼容，如果我们找到旧的结构，我们会移除缓存
    if (fs.existsSync(path.join(config.cacheDir, '_metadata.json'))) {
        emptyDir(config.cacheDir);
    }
    // 获取缓存目录
    const depsCacheDir = getDepsCacheDir(config);
    let cachedMetadata;
    try {
        // 定义缓存文件  /node_modules/.m-vite/deps/_metadata.json
        const cachedMetadataPath = path.join(depsCacheDir, '_metadata.json');
        // 读取缓存的meta json文件
        const metaData = fs.readFileSync(cachedMetadataPath, 'utf-8');
        console.log(metaData);
        // cachedMetadata = parseDepsOptimizerMetadata(fs.readFileSync(cachedMetadataPath, 'utf-8'), depsCacheDir);
    }
    catch (e) {
        // 没有获取到缓存的metadata
    }
    return cachedMetadata;
};

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




