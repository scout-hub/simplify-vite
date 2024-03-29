/*
 * @Author: Zhouqi
 * @Date: 2023-05-15 15:24:19
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-23 20:47:46
 */
import http from 'node:http';

/**
 * @author: Zhouqi
 * @description: 创建本地服务
 */
export const resolveHttpServer = async (app: http.Server) => {
    const { createServer } = await import('node:http');
    return createServer(app);
};

/**
 * @author: Zhouqi
 * @description: 启动本地http服务
 */
export const httpServerStart = (httpServer: http.Server, { port }: { port: number }) => {
    return new Promise((resolve, reject) => {
        httpServer.listen(port, () => {
            resolve(port);
        });
    });
};