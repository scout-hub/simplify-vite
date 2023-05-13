/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 09:54:01
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-12 15:38:26
 */
import cac from "cac";

const cli = cac();
cli
    .command("[root]", "Run the development server")
    .alias("serve")
    .alias("dev")
    .action(async () => {
        const { createServer } = await import("./server");
        await createServer();
    });
cli.help();
cli.parse();