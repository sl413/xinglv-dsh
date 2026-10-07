// 星履 · 功能测试套件（项目里第一套真正的自动断言）
// ---------------------------------------------------------------------------
// 为什么要有它：审计里最重的一条是「零自动化测试」—— 之前所有验收都靠人看截图，
// 于是改动是否破坏功能，只能靠运气发现。这套东西用真实交互 + 只读探针把关键流程断言一遍。
//
// 原则：
//   · **能用真实 UI 的就用真实 UI**（点按钮、打字、点删除），不图省事直接改状态；
//   · 探针只用来读状态与做前置准备；
//   · 每条断言都要能说出「期望什么、实际什么」；
//   · 失败要非零退出。
//
// 用法: node scripts/qa-suite.mjs [端口=5274]
//   口令从 XINGLV_ADMIN_PASSWORD 读（CI 里服务器就是用这个变量设的初始口令）。
//   浏览器路径由 scripts/chrome.mjs 解析，Windows / Linux 都能跑。
import puppeteer from 'puppeteer-core'
import { resolveChrome, HEADLESS_ARGS, ADMIN_PASSWORD } from './chrome.mjs'

const CHROME = resolveChrome()
const PORT = process.argv[2] ?? '5274'
const BASE = `http://127.0.0.1:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

if (!ADMIN_PASSWORD) {
  console.error(
    '\n缺少管理端口令：功能测试里有几条要登录管理端。请显式提供 ——\n' +
      "  PowerShell:  $env:XINGLV_ADMIN_PASSWORD='你的口令'; pnpm test:qa\n" +
      '  bash:        XINGLV_ADMIN_PASSWORD=你的口令 pnpm test:qa\n' +
      '（口令不写进仓库：写死等于推到 GitHub 上公开。）\n',
  )
  process.exit(2)
}

const results = []
let failed = 0
function check(name, ok, detail = '') {
  results.push({ name, ok: !!ok, detail })
  if (!ok) failed++
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  protocolTimeout: 300000,
  args: HEADLESS_ARGS,
})

/* ============================================================ 一、功能测试 */
console.log('\n一、功能测试（真实交互 + 只读探针）')

const page = await browser.newPage()
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const qa = () => page.evaluate(() => window.__XINGLV_QA__.state())

/** 轮询等待一个条件成立（比固定 sleep 可靠：这个无头页面每帧约 600ms） */
async function waitUntil(pred, timeoutMs = 20000, stepMs = 400) {
  const t0 = Date.now()
  for (;;) {
    try {
      if (await pred()) return true
    } catch {
      /* 页面还在忙，下一轮再试 */
    }
    if (Date.now() - t0 > timeoutMs) return false
    await sleep(stepMs)
  }
}

// 干净 profile：这个无头浏览器自带的存储是空的，不会碰到用户真实数据
await page.goto(`${BASE}/?qa&q=balanced`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForSelector('canvas', { timeout: 60000 })
await page.waitForFunction(() => window.__XINGLV_QA__, { timeout: 60000 })
await sleep(11000)

const s0 = await qa()
check('入口层出现（空档案）', s0.total === 0 && s0.phase === 'ready', `total=${s0.total} phase=${s0.phase}`)
check('画质档由 URL 指定生效', s0.quality === 'balanced', `quality=${s0.quality}`)
check('存储模式可用', ['indexeddb', 'localstorage', 'memory'].includes(s0.storageMode), `storageMode=${s0.storageMode}`)

// --- 记录一颗星（真实点击 + 真实输入）---
const clickedNew = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => el.textContent.includes('点亮我的第一颗星'))
  if (b) {
    b.click()
    return true
  }
  return false
})
check('点「点亮我的第一颗星」打开创作面板', clickedNew)
await sleep(1200)
const composerOpen = await page.evaluate(() => !!document.querySelector('.composer'))
check('创作面板渲染', composerOpen)

await page.evaluate(() => {
  const box = document.querySelector('.composer textarea, .composer input')
  if (box) box.focus()
})
await page.keyboard.sendCharacter('把第一件作品交给陌生人')
await sleep(500)
const saved = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('.composer button')]
  const b = btns.find((el) => /保存|点亮/.test(el.textContent) && !el.disabled)
  if (b) {
    b.click()
    return true
  }
  return false
})
check('点保存', saved)
await sleep(4000)
const s1 = await qa()
check('星空里多了一颗星', s1.total === 1, `total=${s1.total}`)
check('落盘后有保存时间戳', !!s1.lastSavedAt, `lastSavedAt=${s1.lastSavedAt}`)

// --- 刷新后仍在 ---
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__XINGLV_QA__, { timeout: 60000 })
await sleep(11000)
const s2 = await qa()
check('刷新后记录还在（真的落盘了）', s2.total === 1, `total=${s2.total}`)

// --- 点开这颗星（真实点击画布上的星）---
const starXY = await page.evaluate(() => {
  const list = window.__XINGLV_QA__.starScreenXY()
  return list.length ? { x: list[0].x, y: list[0].y, id: list[0].id } : null
})
check('能拿到星的屏幕坐标', !!starXY, starXY ? `id=${starXY.id}` : '没有星')
if (starXY) {
  await page.mouse.click(starXY.x, starXY.y)
  await sleep(6500)
  const s3 = await qa()
  // ★ 这里要读的是**镜头导演**的 phase，不是应用的 phase（后者只有 loading/entering/ready）。
  //   第一次写这条断言时用错了字段，把自己的测量错误当成了产品缺陷。
  const camPhase = await page.evaluate(() => window.__XINGLV_QA__.camera().phase)
  check('点星后镜头进入 focused', camPhase === 'focused', `camera.phase=${camPhase}`)
  check('故事面板打开且指向这颗星', s3.reading && s3.reading.kind === 'star' && s3.focusedStarId === starXY.id, `reading=${JSON.stringify(s3.reading)} focused=${s3.focusedStarId}`)
  const panelText = await page.evaluate(() => document.querySelector('.reading')?.textContent ?? '')
  check('面板里显示的是这颗星的内容', panelText.includes('把第一件作品交给陌生人'), panelText.slice(0, 40))
}

// --- 时间轴：往回拉，未来的星退去 ---
const obsAfter = await page.evaluate(async () => {
  window.__XINGLV_QA__.setObs(0)
  await new Promise((r) => setTimeout(r, 900))
  const a = window.__XINGLV_QA__.state().obsTime
  window.__XINGLV_QA__.setObs(1)
  await new Promise((r) => setTimeout(r, 900))
  const b = window.__XINGLV_QA__.state().obsTime
  return { a, b }
})
check('时间轴可刮到最早', obsAfter.a < 0.05, `obsTime=${obsAfter.a}`)
check('时间轴可回到最后', obsAfter.b > 0.95, `obsTime=${obsAfter.b}`)

// --- 自动播放：推进 / 暂停 / 倍速 ---
await page.keyboard.press('Space')
await sleep(1500)
const play1 = await qa()
check('空格键开始播放', play1.obsPlaying === true, `obsPlaying=${play1.obsPlaying}`)
const t1 = play1.obsTime
await sleep(2200)
const play2 = await qa()
check('播放中 obsTime 在推进', play2.obsTime !== t1, `${t1} → ${play2.obsTime}`)
await page.keyboard.press('Space')
await sleep(1500)
const play3 = await qa()
check('空格键暂停', play3.obsPlaying === false, `obsPlaying=${play3.obsPlaying}`)

// --- 删除 + 撤销（真实 UI）---
// ★ 删除前要先把故事面板重新打开：上面刚按过空格开始播放，而**播放会按设计收起面板**
//   （store 注释：「播放是把这一生整体看一遍，不是读某一颗星」）。
//   这不是 bug，是刻意的 —— 但它会让「面板上有删除入口」这条断言在错误的时机采样。
await page.evaluate(() => window.__XINGLV_QA__.setObs(1))
await sleep(1400)
const xyAgain = await page.evaluate(() => {
  const list = window.__XINGLV_QA__.starScreenXY()
  return list.length ? { x: list[0].x, y: list[0].y } : null
})
if (xyAgain) {
  await page.mouse.click(xyAgain.x, xyAgain.y)
  await sleep(6500)
}
// ★ 选择器必须精确到「故事面板」：`.reading` 这个类**两个面板都有**
//   （故事面板与来时路面板），querySelector 取到后者时就找不到删除按钮了 ——
//   第一次跑就是这么误报的。
const delClicked = await page.evaluate(() => {
  const panel = document.querySelector('.reading[aria-label="人生故事"]') ?? document.querySelector('.reading')
  if (!panel) return false
  const b = [...panel.querySelectorAll('button')].find((el) => el.textContent.includes('删除'))
  if (b) {
    b.click()
    return true
  }
  return false
})
check('故事面板上有删除入口', delClicked)
await sleep(900)
// 可能的二次确认
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => /确认删除/.test(el.textContent))
  if (b) b.click()
})
const s4 = await qa()
// ★ 不要用固定 sleep 等异步落盘：这个页面 2 fps，删除要走「写库 → 读回校验」，
//   3.5 秒常常不够（第一次跑就是这么误报的）。改成轮询条件。
const gone = await waitUntil(async () => (await qa()).total === 0, 30000)
check('删除后星数归零', gone && (await qa()).total === 0, `total=${(await qa()).total}`)

const undone = await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find((el) => /^撤销/.test(el.textContent.trim()))
  if (b) {
    b.click()
    return true
  }
  return false
})
const back = await waitUntil(async () => (await qa()).total === 1, 30000)
check('撤销能找回删掉的星（提示条上的撤销入口）', undefined !== back && back, `点了撤销=${undone} total=${(await qa()).total}`)

// --- 示例星河可逆 ---
const sample = await page.evaluate(async () => {
  await window.__XINGLV_QA__.loadSample()
  await new Promise((r) => setTimeout(r, 1500))
  return window.__XINGLV_QA__.state().total
})
check('载入示例星河（35 条）', sample === 35, `total=${sample}`)
const backBanner = await page.evaluate(() => document.body.textContent.includes('不是你自己的记录'))
check('示例状态有常驻提示', backBanner)
const restored = await page.evaluate(async () => {
  await window.__XINGLV_QA__.restoreMySky()
  await new Promise((r) => setTimeout(r, 2500))
  return window.__XINGLV_QA__.state().total
})
check('「回到我的星空」能恢复自己的记录', restored === 1, `total=${restored}`)

// --- 导出 / 清空 / 导入（往返）---
const roundTrip = await page.evaluate(async () => {
  const text = window.__XINGLV_QA__.exportText()
  const before = window.__XINGLV_QA__.state().total
  await window.__XINGLV_QA__.importText(text, 'replace')
  await new Promise((r) => setTimeout(r, 2000))
  return { before, after: window.__XINGLV_QA__.state().total, bytes: text.length }
})
check('导出→导入往返后条数一致', roundTrip.before === roundTrip.after && roundTrip.before === 1, `${roundTrip.before} → ${roundTrip.after}（导出 ${roundTrip.bytes} 字节）`)

/* --- 群星列传与深链 --- */
const livesPage = await browser.newPage()
await livesPage.setViewport({ width: 1440, height: 900 })
await livesPage.goto(`${BASE}/lives`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await livesPage.waitForSelector('.life-card', { timeout: 40000 }).catch(() => {})
const cardCount = await livesPage.evaluate(() => document.querySelectorAll('.life-card').length)
check('群星列传列出 6 位', cardCount === 6, `卡片数=${cardCount}`)

const deep = await browser.newPage()
await deep.setViewport({ width: 1440, height: 900 })
await deep.goto(`${BASE}/life/su-shi?qa&q=balanced`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await deep.waitForFunction(() => window.__XINGLV_QA__, { timeout: 60000 })
await sleep(11000)
const deepState = await deep.evaluate(() => window.__XINGLV_QA__.state())
check('深链 /life/su-shi 直接可用（刷新也能开）', deepState.total === 39, `total=${deepState.total}`)
const guestBar = await deep.evaluate(() => !!document.querySelector('.guest-bar'))
check('他人星空有常驻横幅', guestBar)
// 看别人星空时的写入守卫
const guard = await deep.evaluate(async () => {
  const before = window.__XINGLV_QA__.state().total
  // 直接调导出/导入通道做一次「写」的尝试：replace 成空档案
  await window.__XINGLV_QA__.importText(JSON.stringify({ schemaVersion: 1, achievements: [], journeys: [] }), 'replace')
  await new Promise((r) => setTimeout(r, 1500))
  return { before, after: window.__XINGLV_QA__.state().total }
})
check('看他人星空时个人档案不被改写（隔离守卫）', guard.after === guard.before, `${guard.before} → ${guard.after}`)

/* --- 导入护栏（本轮新增的 P0 修复）--- */
const capTest = await page.evaluate(async () => {
  const big = {
    schemaVersion: 1,
    achievements: Array.from({ length: 60000 }, (_, i) => ({ id: 'x' + i, title: 't', happenedAt: '2020', reflection: '' })),
    journeys: [],
  }
  const res = await window.__XINGLV_QA__.importText(JSON.stringify(big), 'replace')
  return { res, total: window.__XINGLV_QA__.state().total }
})
check(
  '导入 6 万条被明确拒绝（而不是拖垮页面）',
  capTest.res && capTest.res.ok === false && /上限/.test(capTest.res.error ?? ''),
  `ok=${capTest.res?.ok} error=${capTest.res?.error ?? '(无)'}`,
)
check('被拒之后档案没有被破坏', capTest.total === 1, `total=${capTest.total}`)

const dupTest = await page.evaluate(async () => {
  const dup = {
    schemaVersion: 1,
    achievements: [
      { id: 'same-id', title: '第一条', happenedAt: '2020', reflection: '' },
      { id: 'same-id', title: '第二条', happenedAt: '2021', reflection: '' },
    ],
    journeys: [],
  }
  await window.__XINGLV_QA__.importText(JSON.stringify(dup), 'replace')
  await new Promise((r) => setTimeout(r, 1200))
  return window.__XINGLV_QA__.state().total
})
check('重复 id 被去重（否则点谁都打开同一颗星）', dupTest === 1, `total=${dupTest}`)

/* --- 服务端历史版本（本轮新增的反悔入口）--- */
const adminLogin2 = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
})
const cookie2 = adminLogin2.headers.getSetCookie()[0].split(';')[0]

// 备份只在落盘时产生，所以先制造一次真实写入：新增一位临时人物
const tempLife = {
  id: 'qa-temp',
  name: '验收临时人物',
  tagline: '只用于验收，跑完就删',
  summary: '',
  birthYear: null,
  deathYear: null,
  provenance: '验收脚本创建',
  importanceRule: '',
  published: false,
  journeys: [],
  achievements: [{ title: '一条验收用成就', when: '2020', domain: 'craft', pivotal: false, context: '', source: '' }],
}
const created = await fetch(`${BASE}/api/admin/lives`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: cookie2 },
  body: JSON.stringify(tempLife),
})
check('管理端能新增人物（写入路径）', created.status === 201, `status=${created.status}`)

const backups = await fetch(`${BASE}/api/admin/backups`, { headers: { cookie: cookie2 } })
  .then((r) => r.json())
  .catch(() => ({}))
check(
  '每次落盘都会留下一代备份（当前只有 1 代，因为只写了一次）',
  Array.isArray(backups.backups) && backups.backups.length >= 1,
  `${backups.backups?.length ?? 0} 代：${(backups.backups ?? []).map((b) => b.name + '(' + b.count + '位)').join(' ')}`,
)

// 删掉临时人物（这也是一次落盘，会再留一代），再验证「恢复」能把人找回来
const delTemp = await fetch(`${BASE}/api/admin/lives/qa-temp`, { method: 'DELETE', headers: { cookie: cookie2 } })
check('管理端能删除人物', delTemp.status === 200, `status=${delTemp.status}`)
const afterDel = await fetch(`${BASE}/api/lives`).then((r) => r.json())
const hasTempAfterDel = afterDel.lives.some((l) => l.id === 'qa-temp')
check('删除后公开库确实没有它了', !hasTempAfterDel, `lives=${afterDel.lives.length}`)

// 删错了怎么办：从上一版恢复（bak.1 是「删除前」那一刻）
const restoreRes = await fetch(`${BASE}/api/admin/restore`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: cookie2 },
  body: JSON.stringify({ name: 'bak.1' }),
}).then((r) => r.json())
check('能从历史版本恢复（删错了的反悔入口）', restoreRes.ok === true, JSON.stringify(restoreRes).slice(0, 120))
const afterRestore = await fetch(`${BASE}/api/admin/lives`, { headers: { cookie: cookie2 } }).then((r) => r.json())
check(
  '恢复后临时人物回来了',
  afterRestore.lives.some((l) => l.id === 'qa-temp'),
  `lives=${afterRestore.lives.length}`,
)
// 清理：把临时人物再删掉，别留在库里
await fetch(`${BASE}/api/admin/lives/qa-temp`, { method: 'DELETE', headers: { cookie: cookie2 } })
const finalLives = await fetch(`${BASE}/api/lives`).then((r) => r.json())
check('清理完成，公开库回到原本人数', finalLives.lives.length === 6, `lives=${finalLives.lives.length}`)
check('恢复接口匿名访问 → 401', (await fetch(`${BASE}/api/admin/restore`, { method: 'POST' }).then((r) => r.status).catch(() => 0)) === 401)


const anon = await fetch(`${BASE}/api/admin/lives`).then((r) => r.status).catch(() => 0)
check('匿名访问管理接口 → 401', anon === 401, `status=${anon}`)
const login = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
})
check('正确口令能登录 → 200', login.status === 200, `status=${login.status}`)
const badOrigin = await fetch(`${BASE}/api/session`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: 'http://evil.example' },
  body: JSON.stringify({ password: ADMIN_PASSWORD }),
})
check('伪造 Origin 的写请求被拒 → 403', badOrigin.status === 403, `status=${badOrigin.status}`)

/* ======================================================== 二、界面流畅度 */
console.log('\n二、界面流畅度（实测帧间隔与重渲染）')

/** 在页面内量一段时间的 rAF 帧间隔，返回 p50/p95/最长与帧数 */
async function frameStats(page, seconds) {
  return page.evaluate(
    (sec) =>
      new Promise((resolve) => {
        const gaps = []
        let last = performance.now()
        const t0 = last
        const tick = () => {
          const now = performance.now()
          gaps.push(now - last)
          last = now
          if (now - t0 < sec * 1000) requestAnimationFrame(tick)
          else {
            const s = [...gaps].sort((a, b) => a - b)
            resolve({
              frames: gaps.length,
              p50: s[Math.floor(s.length * 0.5)] ?? 0,
              p95: s[Math.floor(s.length * 0.95)] ?? 0,
              max: s[s.length - 1] ?? 0,
              fps: gaps.length / ((now - t0) / 1000),
            })
          }
        }
        requestAnimationFrame(tick)
      }),
    seconds,
  )
}

const perf = await browser.newPage()
await perf.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
await perf.goto(`${BASE}/life/demo-thousand?qa&q=balanced`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await perf.waitForFunction(() => window.__XINGLV_QA__, { timeout: 60000 })
await sleep(13000)

const idle = await frameStats(perf, 6)
console.log(`  静止（1000 条 / balanced / 1280×720）：${idle.fps.toFixed(1)} fps   p50 ${idle.p50.toFixed(1)}ms  p95 ${idle.p95.toFixed(1)}ms  max ${idle.max.toFixed(0)}ms`)
// ★ 不在这个环境里断言绝对帧率：无头 SwiftShader 本来就只有个位数 fps，
//   写「>8fps」这种阈值等于把环境限制当成产品缺陷（第一次跑就是这么误报的）。
//   这里只断言「渲染循环活着」，并把绝对值当参考记录下来。
check('渲染循环活着（不是死锁/白屏）', idle.frames > 0 && idle.max < 15000, `${idle.frames} 帧 / p95 ${idle.p95.toFixed(0)}ms`)

// 相对比较才有意义：同一场景下低画质不应该比均衡画质更慢
const perfLow = await browser.newPage()
await perfLow.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 })
await perfLow.goto(`${BASE}/life/demo-thousand?qa&q=low`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await perfLow.waitForFunction(() => window.__XINGLV_QA__, { timeout: 60000 })
await sleep(13000)
const lowStats = await frameStats(perfLow, 6)
console.log(`  静止（1000 条 / low / 1280×720）：${lowStats.fps.toFixed(1)} fps   p95 ${lowStats.p95.toFixed(1)}ms`)
check('低画质不比均衡画质更慢（相对比较，可跨环境）', lowStats.fps >= idle.fps * 0.8, `low ${lowStats.fps.toFixed(1)} vs balanced ${idle.fps.toFixed(1)}`)
await perfLow.close()

// 拖动时间轴：数一数这期间 store 被写了多少次（React 重渲染的根源）
// ★ 判定方法必须绕开「定时器被饿死」：这个无头页面每帧约 600ms，
//   用 setTimeout 间隔派发事件时实际间隔会被拖到几百毫秒 —— 每次都超过节流阈值，
//   于是「看起来没节流」。正确做法是**同步连发**：同一 tick 内发 40 次 move，
//   节流生效就只写第一次的位置，不生效则写到最后一次的位置。
const dragWrites = await perf.evaluate(async () => {
  const track = document.querySelector('.tl-track')
  if (!track) return { ok: false }
  const r = track.getBoundingClientRect()
  const qa = window.__XINGLV_QA__
  const at = (t) => r.left + r.width * t
  const fire = (type, x) =>
    track.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: r.top + r.height / 2, bubbles: true, pointerId: 1, isPrimary: true }))

  qa.setObs(0)
  await new Promise((res) => setTimeout(res, 400))
  fire('pointerdown', at(0.1))
  const t0 = performance.now()
  // 同步连发 40 次：从 0.1 一路推到 0.9
  for (let i = 1; i <= 40; i++) fire('pointermove', at(0.1 + 0.8 * (i / 40)))
  const burstMs = performance.now() - t0
  const afterBurst = qa.state().obsTime
  fire('pointerup', at(0.9))
  const afterUp = qa.state().obsTime
  return { ok: true, burstMs, afterBurst, afterUp }
})
if (dragWrites.ok) {
  console.log(
    `  拖动时间轴：同一 tick 内连发 40 次 move（耗时 ${dragWrites.burstMs.toFixed(1)}ms）→ 停手前 obsTime=${dragWrites.afterBurst}，抬手后=${dragWrites.afterUp}`,
  )
  // 节流生效：连发期间只写了第一次的值（≈0.1）；抬手补写最终值（≈0.9）
  check(
    '拖动被节流（连发 40 次只写一次，抬手补写最终值）',
    dragWrites.afterBurst < 0.35 && dragWrites.afterUp > 0.85,
    `停手前 ${dragWrites.afterBurst}（期望 ≈0.1）/ 抬手后 ${dragWrites.afterUp}（期望 ≈0.9）`,
  )
} else {
  check('拖动时间轴（找到轨道元素）', false, '没有定位到时间轴轨道')
}
const dragPerf = await frameStats(perf, 2)
console.log(`  拖动之后：${dragPerf.fps.toFixed(1)} fps   p95 ${dragPerf.p95.toFixed(1)}ms`)

// 移动端：不能横向溢出
const mobile = await browser.newPage()
await mobile.setViewport({ width: 430, height: 900, deviceScaleFactor: 1 })
await mobile.goto(`${BASE}/?qa&q=balanced`, { waitUntil: 'domcontentloaded', timeout: 60000 })
await mobile.waitForSelector('canvas', { timeout: 60000 })
await sleep(11000)
const overflow = await mobile.evaluate(() => ({
  scrollW: document.documentElement.scrollWidth,
  innerW: window.innerWidth,
  guestBar: (() => {
    const el = document.querySelector('.guest-bar')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { h: Math.round(r.height), bottom: Math.round(r.bottom) }
  })(),
}))
check('移动端无横向溢出', overflow.scrollW <= overflow.innerW + 1, `scrollWidth=${overflow.scrollW} innerWidth=${overflow.innerW}`)

await browser.close()

/* ------------------------------------------------------------------ 汇总 */
const pass = results.length - failed
console.log(`\n============================`)
console.log(`  功能与流畅度：${pass}/${results.length} 通过${failed ? `，${failed} 条失败` : ''}`)
if (failed) {
  console.log('  失败项：')
  for (const r of results.filter((x) => !x.ok)) console.log(`    · ${r.name}  ${r.detail}`)
}
console.log(`============================`)
process.exit(failed ? 1 : 0)
