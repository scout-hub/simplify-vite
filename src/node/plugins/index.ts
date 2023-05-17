/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:53:40
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-17 17:27:20
 */
import { Plugin } from "../plugin";
import { esbuildTransformPlugin } from "./esbuild";
import { importAnalysisPlugin } from "./importAnalysis";
import { resolvePlugin } from "./resolve";
import { cssPlugin } from "./css";
import { assetPlugin } from "./assets";
import { clientInjectPlugin } from './clientInject';

export function resolvePlugins(
    config: Record<string, any>,
): Plugin[] {
    return [
        resolvePlugin({
            ...config.resolve,
            root: config.root,
            isProduction: config.isProduction,
            packageCache: config.packageCache,
            ssrConfig: config.ssr,
            asSrc: true,
        }),
        esbuildTransformPlugin(),
        importAnalysisPlugin(),
        // cssPlugin(),
        // assetPlugin(),
        // clientInjectPlugin()
    ];
}