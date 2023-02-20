/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 13:53:40
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 16:07:14
 */
import { Plugin } from "../plugin";
import { esbuildTransformPlugin } from "./esbuild";
import { importAnalysisPlugin } from "./importAnalysis";
import { resolvePlugin } from "./resolve";
import { cssPlugin } from "./css";
import { assetPlugin } from "./assets";

export function resolvePlugins(): Plugin[] {
    return [resolvePlugin(), esbuildTransformPlugin(), importAnalysisPlugin(), cssPlugin(), assetPlugin()];
}