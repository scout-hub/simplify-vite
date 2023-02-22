/*
 * @Author: Zhouqi
 * @Date: 2023-02-22 16:28:48
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-22 16:28:49
 */
import connect from "connect";
import { red } from "picocolors";
import { WebSocketServer, WebSocket } from "ws";
import { HMR_PORT } from "./constants";

export function createWebSocketServer(server: connect.Server): {
    send: (msg: string) => void;
    close: () => void;
} {
    let wss: WebSocketServer;
    wss = new WebSocketServer({ port: HMR_PORT });
    wss.on("connection", (socket) => {
        socket.send(JSON.stringify({ type: "connected" }));
    });

    wss.on("error", (e: Error & { code: string }) => {
        if (e.code !== "EADDRINUSE") {
            console.error(red(`WebSocket server error:\n${e.stack || e.message}`));
        }
    });

    return {
        send(payload: Object) {
            const stringified = JSON.stringify(payload);
            wss.clients.forEach((client) => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(stringified);
                }
            });
        },

        close() {
            wss.close();
        },
    };
}