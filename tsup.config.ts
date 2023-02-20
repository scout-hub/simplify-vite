/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 09:51:45
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 09:51:47
 */
import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: "src/node/cli.ts",
    },
    format: ["esm", "cjs"],
    target: "es2020",
    sourcemap: true,
    // 关闭拆包功能
    splitting: false,
});