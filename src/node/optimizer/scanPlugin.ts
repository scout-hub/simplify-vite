/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:30:42
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 11:34:13
 */
import type { Plugin } from "esbuild";
import { BARE_IMPORT_RE, EXTERNAL_TYPES } from "../constants";


export const scanPlugin = (deps: Set<string>): Plugin => {
    return {
        name: "esbuild:scan-deps",
        setup(build) {
            // 忽略的文件类型
            build.onResolve(
                { filter: new RegExp(`\\.(${EXTERNAL_TYPES.join("|")})$`) },
                (resolveInfo) => ({
                    path: resolveInfo.path,
                    // 打上 external 标记
                    external: true,
                })
            );
            // 记录依赖
            build.onResolve(
                {
                    filter: BARE_IMPORT_RE,
                },
                (resolveInfo) => {
                    const { path: id } = resolveInfo;
                    // 推入 deps 集合中
                    deps.add(id);
                    return {
                        path: id,
                        external: true,
                    };
                }
            );
        }
    };
}