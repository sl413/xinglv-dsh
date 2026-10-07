// 星履 · 页面诊断探针（验收用）
// ---------------------------------------------------------------------------
// 用法：node scripts/probe.mjs [path] [port]
// 打开页面，把 console / pageerror / 请求失败 / 关键 DOM 标记全部打出来。
// 无头截图只能看到「白屏」，这个脚本能看到为什么白屏。

import puppeteer from 'puppeteer-core'

const PATH = process.argv[2] ?? '/'
const PORT = Number(process.argv[3] ?? 5276)
const CHROME = process.env.XL_CHROME ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: [
    '--no-sandbox',
    '--disable-gpu',
    '--enable-unsafe-swiftshader',
    '--disable-dev-shm-usage',
    '--window-size=1440,900',
  ],
})

const page = await browser.newPage()
const logs = []
page.on('console', (m) => logs.push(`[console.${m.type()}] ${m.text()}`))
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack ?? '').split('\n').slice(0, 6).join('\n')}`))
page.on('requestfailed', (r) => logs.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`))
page.on('response', (r) => {
  if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`)
})

const url = `http://127.0.0.1:${PORT}${PATH}`
console.log(`打开 ${url}`)
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
} catch (err) {
  logs.push(`[goto] ${err.message}`)
}
await new Promise((r) => setTimeout(r, 6000))

const markers = await page.evaluate(() => ({
  canvas: !!document.querySelector('canvas'),
  brand: !!document.querySelector('.brand'),
  gate: !!document.getElementById('xinglv-gate'),
  root: (document.getElementById('root')?.childElementCount ?? -1),
  qa: !!window.__XINGLV_QA__,
  errors: (window.__XL_ERRORS__ ?? []).slice(0, 5),
  bodyLen: document.body.innerHTML.length,
  rootHtml: (document.getElementById('root')?.innerHTML ?? '').slice(0, 300),
  lifeCards: document.querySelectorAll('.life-card').length,
  adminRow: document.querySelectorAll('.admin-row').length,
  guestBar: !!document.querySelector('.guest-bar'),
  comet: document.querySelectorAll('.guest-bar, .timeline, .light-btn').length,
}))

console.log('\n--- 关键标记 ---')
for (const [k, v] of Object.entries(markers)) console.log(`  ${k}: ${JSON.stringify(v)}`)

console.log('\n--- 浏览器日志 ---')
if (!logs.length) console.log('  （没有日志）')
for (const l of logs.slice(0, 40)) console.log(`  ${l}`)

await browser.close()
