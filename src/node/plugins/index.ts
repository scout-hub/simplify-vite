/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:53:40
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 11:14:47
 */
import { Plugin } from "../plugin";
import { esbuildTransformPlugin } from "./esbuild";
import { importAnalysisPlugin } from "./importAnalysis";
import { resolvePlugin } from "./resolve";
import { cssPlugin } from "./css";
import { assetPlugin } from "./assets";
import { clientInjectPlugin } from './clientInject';
import { getDepsOptimizer } from "../optimizer/optimizer";
import { ResolvedConfig } from "../config";

export function resolvePlugins(
    config: ResolvedConfig,
): Plugin[] {
    return [
        resolvePlugin({
            ...config.resolve,
            getDepsOptimizer: () => getDepsOptimizer(config),
        }),
        esbuildTransformPlugin(),
        importAnalysisPlugin(config),
        // cssPlugin(),
        // assetPlugin(),
        // clientInjectPlugin()
    ];
}