/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 09:54:01
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 16:47:30
 */
import cac from "cac";
import { startDevServer } from "./server";

const cli = cac();
cli
    .command("[root]", "Run the development server")
    .alias("serve")
    .alias("dev")
    .action(async () => {
        await startDevServer();
    });
cli.help();
cli.parse();