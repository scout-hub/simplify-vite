/*
 * @Author: Zhouqi
 * @Date: 2023-05-17 16:45:51
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-29 12:00:13
 */
import { CLIENT_PUBLIC_PATH } from "../constants";
import { ServerContext } from "../server";

export interface HtmlTagDescriptor {
    tag: string
    attrs?: Record<string, string | boolean | undefined>
    children?: string | HtmlTagDescriptor[]
    injectTo?: 'head' | 'body' | 'head-prepend' | 'body-prepend'
}

export const applyHtmlTransforms = async (
    html: string,
    hooks: Function[],
    ctx: {
        server: ServerContext
    },
): Promise<string> => {
    for (const hook of hooks) {
        const res = await hook(html, ctx);
        if (!res) continue;
        let tags: HtmlTagDescriptor[] = res.tags;
        const bodyPrependTags: HtmlTagDescriptor[] = []
        for (const tag of tags) {
            if (tag.injectTo === 'body-prepend') {
                bodyPrependTags.push(tag);
            }
        }
        html = injectToHead(html);
    }
    return html;
};

// 插入客户端脚本
// 即在 head 标签后面加上 <script type="module" src="/@m-vite/client"></script>
const injectToHead = (raw: string) =>
    raw.replace(
        /(<head[^>]*>)/i,
        `$1<script type="module" src="${CLIENT_PUBLIC_PATH}"></script>`
    )
