/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:53:40
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 09:51:09
 */
import { Plugin } from "../plugin";
import { esbuildPlugin } from "./esbuild";
import { importAnalysisPlugin } from "./importAnalysis";
import { resolvePlugin } from "./resolve";
import { cssPlugin } from "./css";
import { assetPlugin } from "./assets";
import { clientInjectPlugin } from './clientInject';
import { getDepsOptimizer } from "../optimizer/optimizer";
import { ResolvedConfig } from "../config";
import { optimizedDepsPlugin } from './optimizedDeps'

export function resolvePlugins(
    config: ResolvedConfig,
): Plugin[] {
    return [
        optimizedDepsPlugin(config),
        resolvePlugin({
            root: config.root,
            ...config.resolve,
            getDepsOptimizer: () => getDepsOptimizer(config),
        }),
        esbuildPlugin(),
        clientInjectPlugin(),
        importAnalysisPlugin(config),
        // cssPlugin(),
        // assetPlugin(),
    ];
}