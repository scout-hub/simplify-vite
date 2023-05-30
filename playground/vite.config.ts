/*
 * @Author: Zhouqi
 * @Date: 2022-11-21 15:51:34
 * @LastEditors: Zhouqi
 * @LastEditTime: 2023-05-30 15:51:48
 */
// import path from 'path';
import { defineConfig } from 'simplify-vite';
const cacheDir: string = 'node_modules/.m-vite';
// import react from '@vitejs/plugin-react';
// import { normalizePath } from 'vite';
// import autoprefixer from 'autoprefixer';
// import windi from 'vite-plugin-windicss';
// import viteEslint from 'vite-plugin-eslint';
// import svgr from 'vite-plugin-svgr';
// import viteImagemin from 'vite-plugin-imagemin';
// import { createSvgIconsPlugin } from 'vite-plugin-svg-icons';
// import { chunkSplitPlugin } from 'vite-plugin-chunk-split';
// import { demoPlugin, testHookPlugin } from './vite-plugins';
// const variablePath = normalizePath(path.resolve('./src/variable.scss'));
// import a from 'simplify-vite';
// console.log(a);
export default defineConfig({
    // 指定预构建输出目录位置
    cacheDir,
});
// https://vitejs.dev/config/
// export default defineConfig(({ mode }) => {
    // const env = loadEnv(mode, process.cwd(), '');
    // const isProduction = env.VITE_NODE_ENV === 'production';
    // 填入项目的 CDN 域名地址
    // const CDN_URL = 'https://sanyuan.cos.ap-beijing.myqcloud.com/';
    // return {
        // base: isProduction ? CDN_URL : '/',
        // optimizeDeps: {
        //   include: ['lodash-es']
        // },
        // plugins: [
        // createSvgIconsPlugin({
        //   iconDirs: [path.join(__dirname, 'src/assets/icons')]
        // }),
        // viteImagemin({
        //   // 无损压缩配置，无损压缩下图片质量不会变差
        //   optipng: {
        //     optimizationLevel: 7
        //   },
        //   // 有损压缩配置，有损压缩下图片质量可能会变差
        //   pngquant: {
        //     quality: [0.8, 0.9]
        //   },
        //   // svg 优化
        //   svgo: {
        //     plugins: [
        //       {
        //         name: 'removeViewBox'
        //       },
        //       {
        //         name: 'removeEmptyAttrs',
        //         active: false
        //       }
        //     ]
        //   }
        // }),
        // react({
        //   babel: {
        //     // 加入 babel 插件
        //     // 以下插件包都需要提前安装
        //     // 当然，通过这个配置你也可以添加其它的 Babel 插件
        //     plugins: [
        //       // 适配 styled-component
        //       'babel-plugin-styled-components'
        //     ]
        //   },
        // })
        // windi(),
        // viteEslint({
        //   exclude: ['node_modules/**', 'dist/**', 'src/assets/**']
        // }),
        // svgr(),
        // chunkSplitPlugin({
        //   // 指定拆包策略
        //   customSplitting: {
        //     // 1. 支持填包名。`react` 和 `react-dom` 会被打包到一个名为`render-vendor`的 chunk 里面(包括它们的依赖，如 object-assign)
        //     'react-vendor': ['react', 'react-dom'],
        //     // 2. 支持填正则表达式。src 中 components 和 utils 下的所有文件被会被打包为`component-util`的 chunk 中
        //     'components-util': [/src\/components/, /src\/utils/]
        //   }
        // })
        // demoPlugin({}),
        // testHookPlugin()
        // ],
        // build: {
        //   // 8 KB
        //   assetsInlineLimit: 8 * 1024
        // },
        // css 相关的配置
        // css: {
        //   modules: {
        //     // 一般我们可以通过 generateScopedName 属性来对生成的类名进行自定义
        //     // 其中，name 表示当前文件名，local 表示类名
        //     generateScopedName: '[name]__[local]___[hash:base64:5]'
        //   },
        //   preprocessorOptions: {
        //     scss: {
        //       // additionalData 的内容会在每个 scss 文件的开头自动注入
        //       additionalData: `@import "${variablePath}";`
        //     }
        //   },
        //   // 进行 PostCSS 配置
        //   postcss: {
        //     plugins: [
        //       autoprefixer({
        //         // 指定目标浏览器
        //         overrideBrowserslist: [
        //           'Chrome > 40',
        //           'ff > 31',
        //           'ie 11',
        //           'last 2 versions'
        //         ]
        //       })
        //     ]
        //   }
        // },
        // resolve: {
        //   // 别名配置
        //   alias: {
        //     '@assets': path.join(__dirname, 'src/assets'),
        //     '@': path.join(__dirname, 'src/')
        //   }
        // }
        // 项目中还存在其它格式的静态资源，你可以通过assetsInclude配置让 Vite 来支持加载:
        // assetsInclude: ['.gltf']
        // 这样会将 JSON 的内容解析为export default JSON.parse("xxx")，这样会失去按名导出的能力，
        // 不过在 JSON 数据量比较大的时候，可以优化解析性能。
        // json: {
        //   stringify: true
        // }
//     };
// });
