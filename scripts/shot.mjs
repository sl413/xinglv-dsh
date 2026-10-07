// 星履 · 可靠截图（puppeteer）
// ---------------------------------------------------------------------------
// 用法：
//   node scripts/shot.mjs <名字> [路径] [端口] [宽度] [高度] [等待毫秒]
//   例：node scripts/shot.mjs my-shot /life/su-shi 5274 1600 900 40000
//
// 为什么不用 chrome --screenshot：
//   那个开关在**页面 load 时**就抓图，而这个应用要等 JS 执行完、WebGL 首帧画出来
//   才算就绪 —— 于是同一台服务器上，截图时好时坏：有时抓到完整星河，
//   有时只抓到启动画面（实测反复出现 271 KB 的纯启动图）。
//   这里改成显式等待：先等 canvas 出现，再等驱动脚本写出「done」，
//   最后再多等一会儿让画面稳定，然后才抓。
import { resolveChrome, HEADLESS_ARGS } from './chrome.mjs'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const name = process.argv[2] ?? 'shot'
const path = process.argv[3] ?? '/'
const port = Number(process.argv[4] ?? 5274)
const width = Number(process.argv[5] ?? 1600)
const height = Number(process.argv[6] ?? 900)
const settle = Number(process.argv[7] ?? 30000)

const CHROME = resolveChrome()
const outDir = resolve('.shots')
mkdirSync(outDir, { recursive: true })
const out = resolve(outDir, `${name}.png`)

const drive = /[?&]drive=([A-Za-z0-9_-]+)/.exec(path)?.[1]
const clean = path.replace(/[?&]drive=[A-Za-z0-9_-]+/, '')
const url = `http://127.0.0.1:${port}${clean}${clean.includes('?') ? '&' : '?'}qa=1&q=high${drive ? `&drive=${drive}` : ''}`

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    '--no-sandbox',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
  ],
  defaultViewport: { width, height },
})

try {
  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 160)))
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 })

  // ① 等 WebGL 首帧：canvas 出现
  await page.waitForSelector('canvas', { timeout: 90000 }).catch(() => {})
  // ② 等驱动脚本收工（它最后一行是 done after …）
  if (drive) {
    await page
      .waitForFunction(
        () => {
          const b = Array.from(document.querySelectorAll('div')).find((d) =>
            (d.textContent ?? '').startsWith('drive='),
          )
          return !!b && /done after|DRIVE FAIL/.test(b.textContent ?? '')
        },
        { timeout: 180000, polling: 500 },
      )
      .catch(() => {})
  }
  // ③ 让渲染稳定下来
  await new Promise((r) => setTimeout(r, settle))

  await page.screenshot({ path: out })
  const info = await page.evaluate(() => ({
    canvas: !!document.querySelector('canvas'),
    banner: (Array.from(document.querySelectorAll('div')).find((d) =>
      (d.textContent ?? '').startsWith('drive='),
    )?.textContent ?? '').split('\n').slice(-1)[0],
  }))
  console.log(`OK ${name} -> ${out}`)
  console.log(`   canvas=${info.canvas}  末行=${info.banner || '(无驱动)'}`)
  if (errors.length) console.log(`   页面错误：${errors.slice(0, 3).join(' | ')}`)
} finally {
  await browser.close()
}
