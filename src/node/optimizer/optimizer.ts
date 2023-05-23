/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 17:54:21
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
    createIsOptimizedDepUrl
} from '.'
import { ResolvedConfig } from "../config";
import { emptyDir } from "../utils";

/**
 * @author: Zhouqi
 * @description: 初始化依赖分析
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
 * @description: 创建预构建依赖分析
 */
const createDepsOptimizer = async (
    config: ResolvedConfig,
    server?: Record<string, any>,
) => {
    let postScanOptimizationResult: Promise<any> | undefined;
    // 读取缓存的metadata json文件
    const cachedMetadata = loadCachedDepOptimizationMetadata(config);
    // 创建metadata对象，缓存预构建依赖的信息
    let metadata = cachedMetadata || initDepsOptimizerMetadata(config);

    const depsOptimizer = {
        metadata,
        getOptimizedDepId: (depInfo: OptimizedDepInfo) => `${depInfo.file}`,
        delayDepsOptimizerUntil,
        isOptimizedDepFile: (id: string) => isOptimizedDepFile(id, config),
        isOptimizedDepUrl: createIsOptimizedDepUrl(config),
    };

    // 将预构建依赖分析对象存入map中
    depsOptimizerMap.set(config, depsOptimizer);

    // 是否是第一次预构建，不存在缓存的metadata
    if (!cachedMetadata) {
        // todo 开发模式下才需要扫描依赖
        const deps = await discoverProjectDependencies(config);
        for (const id of Object.keys(deps)) {
            if (!metadata.discovered[id]) {
                addMissingDep(id, deps[id]);
            }
        }
        postScanOptimizationResult = runOptimizeDeps(config, deps);
    }

    // 添加缺失的依赖信息
    function addMissingDep(id: string, resolved: string) {
        return addOptimizedDepInfo(metadata, 'discovered', {
            id,
            file: getOptimizedDepPath(id, config),
            src: resolved,
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
        const crawlDeps = Object.keys(metadata.discovered)
        if (postScanOptimizationResult) {
            const result = await postScanOptimizationResult;
            postScanOptimizationResult = undefined;

            // todo 缺少scan时的依赖记录
            const scanDeps = Object.keys(result.metadata.optimized)
            // 判断是否有缺失的预构建依赖
            const needsInteropMismatch = findInteropMismatches(metadata.discovered, result.metadata.optimized);
            const scannerMissedDeps = crawlDeps.some((dep) => !scanDeps.includes(dep));
            const outdatedResult = needsInteropMismatch.length > 0 || scannerMissedDeps;
            console.log(scannerMissedDeps);
        } else {
            throw new Error('!postScanOptimizationResult');
        }
    }
}

/**
 * @author: Zhouqi
 * @description: 查找预构建依赖
 */
const discoverProjectDependencies = async (config: Record<string, any>) => {
    // 根据import进行依赖分析，找出需要预构建的资源
    const { deps } = await scanImports(config);
    return deps;
}

/**
 * @author: Zhouqi
 * @description: 获取缓存的预构建依赖信息
 */
const loadCachedDepOptimizationMetadata = (config: ResolvedConfig): DepOptimizationMetadata | undefined => {
    // 缓存目录存在则清空
    if (fs.existsSync(path.join(config.cacheDir, '_metadata.json'))) {
        emptyDir(config.cacheDir);
    }
    // 获取缓存目录
    const depsCacheDir = getDepsCacheDir(config);
    let cachedMetadata;
    try {
        // 定义缓存地址
        const cachedMetadataPath = path.join(depsCacheDir, '_metadata.json');
        const metaData = fs.readFileSync(cachedMetadataPath, 'utf-8');
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

