/*
 * @Author: Zhouqi
 * @Date: 2023-05-17 16:45:51
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 13:59:06
 */
import { CLIENT_PUBLIC_PATH } from "../constants";

export interface HtmlTagDescriptor {
    tag: string
    attrs?: Record<string, string | boolean | undefined>
    children?: string | HtmlTagDescriptor[]
    injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend'
}

export const applyHtmlTransforms = async (
    html: string,
): Promise<string> => {
    return injectToHead(html);
};

// 插入客户端脚本
// 即在 head 标签后面加上 <script type="module" src="/@m-vite/client"></script>
const injectToHead = (
    raw: string,
): string => raw.replace(
    /(<head[^>]*>)/i,
    `$1\n  <script type="module" src="${CLIENT_PUBLIC_PATH}"></script>`
);

