/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:12:35
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 11:11:29
 */
// connect 是一个具有中间件机制的轻量级 Node.js 框架。
// 既可以单独作为服务器，也可以接入到任何具有中间件机制的框架中，如 Koa、Express
import connect from "connect";
// picocolors 是一个用来在命令行显示不同颜色文本的工具
import { blue, green } from "picocolors";
import { optimize } from "../optimizer";

export const startDevServer = async () => {
    const app = connect();
    const root = process.cwd();
    const startTime = Date.now();
    app.listen(3000, async () => {
        await optimize(root);
        console.log(
            green("🚀 No-Bundle 服务已经成功启动!"),
            `耗时: ${Date.now() - startTime}ms`
        );
        console.log(`> 本地访问路径: ${blue("http://localhost:3000")}`);
    });
}