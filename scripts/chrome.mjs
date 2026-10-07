// 浏览器解析：让所有脚本都能在本机和 CI（Linux）上跑起来，不再各写一份写死的路径。
// ---------------------------------------------------------------------------
// 什么时候需要它：scripts/shot.mjs、qa-suite.mjs、promo-*.mjs 都要开 Chrome，
// 原来每个文件里都写死了 'C:/Program Files/Google/Chrome/Application/chrome.exe' ——
// 换一台机器、或者放进 GitHub Actions（Linux）就全跑不起来。
import { existsSync } from 'node:fs'

/** 各平台常见的 Chrome/Chromium 位置（按顺序试） */
const CANDIDATES = [
  process.env.CHROME_PATH, // 显式指定优先
  process.env.CHROME_BIN,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  `${process.env.LOCALAPPDATA ?? ''}/Google/Chrome/Application/chrome.exe`,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

/** 找到可用的浏览器可执行文件；找不到就抛出带指引的错误 */
export function resolveChrome() {
  for (const p of CANDIDATES) {
    try {
      if (existsSync(p)) return p
    } catch {
      /* 忽略非法路径 */
    }
  }
  throw new Error(
    '找不到 Chrome。可以用 CHROME_PATH 指定，例如：\n' +
      '  Windows: CHROME_PATH="C:/Program Files/Google/Chrome/Application/chrome.exe"\n' +
      '  Linux  : CHROME_PATH=/usr/bin/google-chrome\n' +
      `已尝试：\n  ${CANDIDATES.join('\n  ')}`,
  )
}

/**
 * headless 启动参数（所有脚本共用）。
 * ★ --enable-unsafe-swiftshader 是给 CI 用的：GitHub Actions 的机器没有 GPU，
 *   新版 Chrome 默认拒绝用软件渲染跑 WebGL，不给这个开关会直接拿不到 3D 画面。
 *   本机带上它也无害（有 GPU 时优先用 GPU）。
 */
export const HEADLESS_ARGS = [
  '--no-sandbox',
  '--disable-gpu',
  '--disable-breakpad',
  '--disable-crash-reporter',
  '--mute-audio',
  '--hide-scrollbars',
  '--enable-unsafe-swiftshader',
]

/**
 * 管理端口令：**只从环境变量读**。
 *
 * ★ 这里绝不能有「本机默认口令」的兜底字符串 —— 我第一版就把开发口令写死在这里，
 *   而仓库是要推到 GitHub（公开）的，那等于把口令一起公开。
 *   本机跑测试时显式带上：
 *     PowerShell:  $env:XINGLV_ADMIN_PASSWORD='你的口令'; pnpm test:qa
 *     bash:        XINGLV_ADMIN_PASSWORD=你的口令 pnpm test:qa
 *   CI 里由 workflow 的 env 提供（一次性容器，口令随容器销毁）。
 */
export const ADMIN_PASSWORD = process.env.XINGLV_ADMIN_PASSWORD ?? ''
