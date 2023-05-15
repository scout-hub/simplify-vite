/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 09:51:45
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-15 11:13:10
 */
import { defineConfig } from "tsup";

export default defineConfig({
    entry: {
        index: 'src/node/index.ts',
        cli: "src/node/cli.ts",
        client: "src/client/client.ts",
    },
    format: ["esm", "cjs"],
    target: "es2020",
    sourcemap: true,
    // 关闭拆包功能
    splitting: false,
});