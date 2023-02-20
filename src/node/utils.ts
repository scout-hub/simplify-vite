/*
 * @Author: Zhouqi
 * @Date: 2023-02-20 11:47:03
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-02-20 14:38:26
 */
import os from "os";
import path from "path";
import { HASH_RE, QEURY_RE, JS_TYPES_RE } from "./constants";

export const slash = (p: string): string => p.replace(/\\/g, "/");
export const isWindows = os.platform() === "win32";
export const normalizePath = (id: string): string => path.posix.normalize(isWindows ? slash(id) : id);
export const isJSRequest = (id: string): boolean => {
    id = cleanUrl(id);
    if (JS_TYPES_RE.test(id)) {
        return true;
    }
    if (!path.extname(id) && !id.endsWith("/")) {
        return true;
    }
    return false;
};

export const cleanUrl = (url: string): string =>
    url.replace(HASH_RE, "").replace(QEURY_RE, "");