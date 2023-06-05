/*
 * @Author: Zhouqi
 * @Date: 2023-05-24 16:41:51
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-06-05 17:03:50
 */
import { promises as fs } from 'node:fs';
import { ResolvedConfig } from "../config"
import { optimizedDepInfoFromFile } from "../optimizer";
import { getDepsOptimizer } from "../optimizer/optimizer"

// 预构建依赖插件
export const optimizedDepsPlugin = (config: ResolvedConfig): any => {
    return {
        name: 'm-vite:optimized-deps',
        async resolveId(id: string) {
            // 判断是否是预构建的依赖
            if (getDepsOptimizer(config)?.isOptimizedDepFile(id)) {
                return id;
            }
        },
        async load(id: string, options: Record<string, any>) {
            const depsOptimizer = getDepsOptimizer(config);
            // 判断是否是预构建的依赖
            if (depsOptimizer?.isOptimizedDepFile(id)) {
                const metadata = depsOptimizer.metadata;
                const info = optimizedDepInfoFromFile(metadata, id);
                if (info) {
                    // 如果info存在需要等待其预构建完成，此时磁盘中(/node_modules/m-vite/deps)已经生成了预构建结果
                    await info.processing;
                }
                try {
                    return await fs.readFile(id, 'utf-8');
                } catch (error) {
                    console.log(id, error);
                }
            }
        }
    }
}