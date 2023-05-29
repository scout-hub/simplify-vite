/*
 * @Author: Zhouqi
 * @Date: 2023-05-26 14:20:37
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-26 14:23:02
 */
import { ResolvedConfig } from './config';

/**
 * @author: Zhouqi
 * @description: 解析chokidar配置
 */
export function resolveChokidarOptions(
    config: ResolvedConfig,
    options: Record<string, any>
): Record<string, any> {
    const { ignored = [], ...otherOptions } = options ?? {};

    const resolvedWatchOptions: Record<string, any> = {
        ignored: [
            '**/.git/**',
            '**/node_modules/**',
            '**/test-results/**', // Playwright
            config.cacheDir + '/**',
            ...(Array.isArray(ignored) ? ignored : [ignored]),
        ],
        ignoreInitial: true,
        ignorePermissionErrors: true,
        ...otherOptions,
    };

    return resolvedWatchOptions;
}
