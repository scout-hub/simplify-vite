/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 10:53:39
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 11:02:56
 */
import path from "path";

export const optimize = async (root: string) => {
    // 1. 确定入口
    const entry = path.resolve(root, "src/main.tsx");
    console.log(1);
}