// 纯函数测试：零新依赖（esbuild 打包后交给 node --test 跑）
// ---------------------------------------------------------------------------
// 为什么要有它：功能测试（qa-suite.mjs）要开浏览器、跑五分钟，适合验「整条链路」；
// 而**纯函数**的逻辑最容易被改坏、又最不该靠人肉验证 —— 时间解析、坐标映射、
// 逆函数这些地方错一位，页面上只是「看起来有点怪」，没人会发现。
//
// 为什么要先打包：layout.ts 内部用的是无扩展名 import（`from './types'`），
// Vite 认，但 Node 的 ESM 解析器不认。esbuild 是 vite 自带的依赖，用它打一次包即可，
// 不需要引入 vitest/jest 之类的新框架。
//
// 用法:
//   node node_modules/esbuild/bin/esbuild scripts/tests/pure.test.mjs --bundle \
//     --platform=node --format=esm --outfile=.tmp/pure.test.mjs
//   node --test .tmp/pure.test.mjs
// 或者直接 pnpm test:pure
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { parseWhen, formatWhen, draftHasContent, emptyArchive, SCHEMA_VERSION } from '../../src/core/types.ts'
import { DOMAINS } from '../../src/core/domains.ts'
import { GALAXY, armAngleAt, radiusAtTime, timeAtRadius, starPositionAt, buildUniverse } from '../../src/core/layout.ts'
import { clamp01 } from '../../src/core/math.ts'

/** 星臂数 = 领域数（每个领域一条臂）。
 *  角距判据也在这里算清楚：十条臂均匀分布时，臂间距 = 2π/10 = 0.628 rad，
 *  任意点到最近脊线的角距**最大就是间距的一半 0.314**；所谓「外侧半格」= 0.157，
 *  是**间距的四分之一**。（我曾在文档里把 0.157 写成「间距的一半」，那是算错的。） */
const ARM_COUNT = DOMAINS.length
const ARM_SPACING = (Math.PI * 2) / ARM_COUNT
const HALF_SPACING = ARM_SPACING / 2
const OUTER_HALF = ARM_SPACING / 4

/** 到最近一条臂脊线的角距 */
function nearestArmGap(theta: number, t: number): number {
  let best = Infinity
  for (let k = 0; k < ARM_COUNT; k++) {
    let d = theta - (armAngleAt(k) + GALAXY.WIND * t)
    d = Math.atan2(Math.sin(d), Math.cos(d))
    best = Math.min(best, Math.abs(d))
  }
  return best
}

/* ------------------------------------------------------------------ 时间 */
test('parseWhen：只写年份时按本地正午解析（避免差一天）', () => {
  const t = parseWhen('2019')
  assert.ok(t !== null)
  const d = new Date(t)
  assert.equal(d.getFullYear(), 2019)
  assert.equal(d.getMonth(), 0)
  assert.equal(d.getDate(), 1)
  assert.equal(d.getHours(), 12, '必须是本地正午 12:00 —— 用 0 点会在某些时区偏成前一天')
})

test('parseWhen：年/月/日三档精度都能解析，且越精确越晚', () => {
  const y = parseWhen('2019')
  const m = parseWhen('2019-03')
  const d = parseWhen('2019-03-15')
  assert.ok(y < m && m < d)
  assert.equal(new Date(m).getMonth(), 2)
  assert.equal(new Date(d).getDate(), 15)
})

test('parseWhen：空值与垃圾输入返回 null（不抛错）', () => {
  for (const v of [null, undefined, '', '   ', '不是日期']) assert.equal(parseWhen(v), null, `输入 ${JSON.stringify(v)}`)
})

test('formatWhen：按录入精度显示，不假装知道具体哪一天', () => {
  assert.equal(formatWhen('2019'), '2019 年')
  assert.equal(formatWhen('2019-03'), '2019 年 3 月')
  assert.equal(formatWhen('2019-03-15'), '2019 年 3 月 15 日')
  assert.equal(formatWhen(''), '时间未记录')
})

/* ------------------------------------------------------------ 银河坐标 */
test('armAngleAt：每条臂都严格按公式（i·2π/臂数 + 0.33·sin(i·2.13)）', () => {
  for (let i = 0; i < ARM_COUNT; i++) {
    const a = armAngleAt(i)
    assert.ok(Number.isFinite(a))
    const expect = (i * Math.PI * 2) / ARM_COUNT + 0.33 * Math.sin(i * 2.13)
    assert.ok(Math.abs(a - expect) < 1e-9, `第 ${i} 条臂偏离公式 ${Math.abs(a - expect)}`)
  }
})

test('radiusAtTime / timeAtRadius 互为逆函数（时间轴靠它成立）', () => {
  for (const t of [0, 0.13, 0.5, 0.77, 1]) {
    const back = timeAtRadius(radiusAtTime(t))
    assert.ok(Math.abs(back - t) < 1e-6, `t=${t} → r=${radiusAtTime(t)} → t'=${back}`)
  }
})

test('radiusAtTime 单调递增：时间越晚，半径越大', () => {
  let prev = -Infinity
  for (let i = 0; i <= 20; i++) {
    const r = radiusAtTime(i / 20)
    assert.ok(r > prev, `半径必须随 t 单调增（i=${i}）`)
    prev = r
  }
})

test('starPositionAt：jitter=0 时严格落在星臂脊线上（星云层取中心线靠它）', () => {
  for (let i = 0; i < ARM_COUNT; i++) {
    const p = starPositionAt(0.5, i, 12345, 0)
    const theta = Math.atan2(p[2], p[0])
    const expect = armAngleAt(i) + GALAXY.WIND * 0.5
    const gap = Math.abs(Math.atan2(Math.sin(theta - expect), Math.cos(theta - expect)))
    assert.ok(gap < 1e-9, `第 ${i} 条臂偏了 ${gap} rad`)
    assert.ok(Math.hypot(p[0], p[2]) > 0)
  }
})

test('starPositionAt：确定性 —— 同种子同位置，不同种子不同位置', () => {
  assert.deepEqual(starPositionAt(0.4, 3, 998877), starPositionAt(0.4, 3, 998877), '否则每次刷新星都在跳')
  assert.notDeepEqual(starPositionAt(0.4, 3, 998877), starPositionAt(0.4, 3, 998878))
})

test('散布：星臂上密、盘面上也有散落（不是十条细线）', () => {
  const N = 1500
  const gaps = []
  let outer = 0
  for (let i = 0; i < N; i++) {
    const p = starPositionAt(0.5, i % ARM_COUNT, 1000 + i)
    const g = nearestArmGap(Math.atan2(p[2], p[0]), 0.5)
    gaps.push(g)
    if (g > OUTER_HALF) outer++
  }
  gaps.sort((a, b) => a - b)
  const median = gaps[Math.floor(gaps.length / 2)]
  const ratio = outer / N
  // 阈值要能抓住两种崩塌：
  //   · 散布被去掉（星全贴回十条脊线）→ 中位角距趋近 0
  //   · 变成完全均匀（星臂不再成脊）→ 中位角距趋近 OUTER_HALF
  // 实测：1500 颗混合族群的中位角距是 0.131。注意这跟浏览器验收在 39 条真实档案上量到的
  // 0.097 不是同一个总体（族群比例不同），两个数不能互相替换。
  assert.ok(median > 0.04 && median < 0.15, `中位角距应在 0.04~0.15 rad，实测 ${median.toFixed(3)}`)
  assert.ok(ratio > 0.2 && ratio < 0.45, `外侧半格占比应在 20%~45%，实测 ${(ratio * 100).toFixed(0)}%`)

  // ★ 上界要**从实际臂角算**，不能用「间距 0.628 的一半 = 0.314」这种理想值：
  //   armAngleAt 带 0.33·sin(i·2.13) 的扰动，十条臂并不严格均匀，
  //   最宽的那道缝比平均宽，所以实际能出现的最大角距会超过 0.314。
  //   （我第一版就是这么写错的：断言「不可能超过半间距」，被自己的测试打脸。）
  const angles = Array.from({ length: ARM_COUNT }, (_, i) => ((armAngleAt(i) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)).sort(
    (a, b) => a - b,
  )
  const spacings = angles.map((a, i) => (i === angles.length - 1 ? angles[0] + Math.PI * 2 : angles[i + 1]) - a)
  const widestHalf = Math.max(...spacings) / 2
  const narrowestHalf = Math.min(...spacings) / 2
  const maxGap = gaps[gaps.length - 1]
  assert.ok(
    maxGap <= widestHalf + 1e-9,
    `任何点到最近脊线的角距不可能超过「最宽那道缝的一半」${widestHalf.toFixed(3)}，实测 ${maxGap.toFixed(3)}`,
  )
  assert.ok(
    widestHalf > narrowestHalf * 1.1,
    `臂间距应当明显不均（这正是 0.33·sin 扰动的作用）：最宽半缝 ${widestHalf.toFixed(3)} vs 最窄 ${narrowestHalf.toFixed(3)}`,
  )
})

/* ------------------------------------------------------------ 组装世界 */
test('buildUniverse：空档案不崩，字段齐全', () => {
  const u = buildUniverse(emptyArchive())
  assert.equal(u.stars.length, 0)
  assert.equal(u.stats.total, 0)
  assert.ok(u.frame.endMs >= u.frame.originMs)
  assert.ok(Number.isFinite(u.density.gasScale) && u.density.gasScale > 0)
})

test('buildUniverse：条数 / byId 映射 / 时间区间 / 半径随时序都对得上', () => {
  const base = emptyArchive()
  const archive = {
    ...base,
    schemaVersion: SCHEMA_VERSION,
    achievements: [
      { id: 'a1', title: '最早', happenedAt: '2001', reflection: '', domain: 'academy', importance: 3, resonance: 0, createdAt: '', updatedAt: '' },
      { id: 'a2', title: '中间', happenedAt: '2010-05', reflection: '', domain: 'craft', importance: 5, resonance: 4, createdAt: '', updatedAt: '' },
      { id: 'a3', title: '最晚', happenedAt: '2020-12-31', reflection: '', domain: 'creation', importance: 1, resonance: 0, createdAt: '', updatedAt: '' },
    ],
    journeys: [],
  }
  const u = buildUniverse(archive)
  assert.equal(u.stars.length, 3)
  assert.equal(u.stats.total, 3)
  assert.equal(u.byId.get('a1'), 0, 'byId 必须把 id 映射到数组下标（点星靠它反查）')
  assert.equal(u.byId.get('a3'), 2)
  assert.ok(u.frame.originMs <= parseWhen('2001'))
  assert.ok(u.frame.endMs >= parseWhen('2020-12-31'))
  const r = u.stars.map((s) => Math.hypot(s.position[0], s.position[2]))
  assert.ok(r[0] < r[1] && r[1] < r[2], `半径应随时间递增：${r.map((x) => x.toFixed(2)).join(' < ')}`)
})

test('buildUniverse：密度随星数上升并饱和', () => {
  const mk = (n) =>
    buildUniverse({
      ...emptyArchive(),
      achievements: Array.from({ length: n }, (_, i) => ({
        id: 'x' + i,
        title: 't' + i,
        happenedAt: String(2000 + (i % 20)),
        reflection: '',
        domain: 'craft',
        importance: 3,
        resonance: 0,
        createdAt: '',
        updatedAt: '',
      })),
      journeys: [],
    })
  const few = mk(5)
  const many = mk(2000)
  assert.ok(many.density.gasScale > few.density.gasScale, '星多则星云更密')
  assert.ok(many.density.gasScale <= 1 && many.density.coreScale <= 1, '密度必须饱和在 1 以内')
  assert.ok(many.density.dustCount <= 8400, '尘粒数有上限（不然低端机直接崩）')
  assert.ok(few.density.dustCount >= 2200, '尘粒数有下限（太少就不像盘面）')
})

/* ---------------------------------------------------------------- 草稿 */
test('draftHasContent：只有空白字符不算写过', () => {
  assert.equal(draftHasContent({ title: '  ', reflection: '\n\t', journeyName: '' }), false)
  assert.equal(draftHasContent({ title: '一句话', reflection: '', journeyName: '' }), true)
  assert.equal(draftHasContent({ title: '', reflection: '一个理由', journeyName: '' }), true)
  assert.equal(draftHasContent(null), false)
  assert.equal(draftHasContent(undefined), false)
})

test('clamp01 边界', () => {
  assert.equal(clamp01(-1), 0)
  assert.equal(clamp01(2), 1)
  assert.equal(clamp01(0.42), 0.42)
})
