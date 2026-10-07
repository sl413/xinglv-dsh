import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 星履 / XingLv — 独立实现，无任何外部受许可源码依赖。
//
// 两个环境变量控制构建形态（GitHub Pages 的工作流会用它们）：
//   VITE_BASE   —— 部署在子路径时必须是绝对子路径，例如 /xinglv/
//   VITE_STATIC —— 纯静态托管：名人库改用「连虚构人物一起打包」的那一份
//
// 注意这里用的是 globalThis 而不是 process：这个配置文件也在 `tsc --noEmit` 的范围里，
// 而项目没有装 @types/node —— 直接写 process 会类型报错（而为了两个变量装一整套
// node 类型并不划算）。
const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {}
const base = env.VITE_BASE ?? '/'
const isStatic = env.VITE_STATIC === '1'

export default defineConfig({
  plugins: [react()],
  // 必须是绝对路径：/life/xxx 这类「可直接分享的网址」如果按相对路径解析，
  // 浏览器会去 /life/assets/... 找脚本，被 SPA 回退成 HTML，页面直接白屏。
  // 部署到 username.github.io/仓库名/ 时由 VITE_BASE 给出 /仓库名/。
  base,
  resolve: isStatic
    ? {
        alias: [
          // 静态站换上带虚构人物的种子包；应用服务器形态仍用只含真人的那份，
          // 这样普通构建不会因为「一千条成就」而变大。
          // 以 / 开头表示相对项目根，Vite 会自己解析成绝对路径。
          {
            find: /^\.\/seedBundle$/,
            replacement: '/src/core/lives/seedBundle.static.ts',
          },
        ],
      }
    : undefined,
  server: {
    port: 5273,
    strictPort: true,
    host: '127.0.0.1',
    // 开发时把 /api 转发给应用服务器，匿名浏览与登录都能在 dev 下工作
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:5274',
        changeOrigin: false,
      },
    },
  },
  preview: {
    port: 5274,
    strictPort: true,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 2400,
  },
})
