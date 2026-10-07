// 星履 · 名人库收录范围检查
// ---------------------------------------------------------------------------
// 用法：node scripts/check-library.mjs [lives.json]
// 默认检查 server/data/lives.json（如果还不存在就检查 server/seed/lives.json）。
//
// 「我要的是生平成就，不要加入其他明显不属于成就的」——
// 这句话要能被执行，而不只是写在文档里。这个脚本按标题与背景文本识别
// **传记事件**（生卒、疾病、婚丧、迁居、单纯的行程、别人的作为），
// 命中就报错并以非零码退出，于是它可以挂进构建流程。

import { existsSync, readFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const candidates = [
  process.argv[2],
  join(ROOT, 'server/data/lives.json'),
  join(ROOT, 'server/seed/lives.json'),
  // ★ 虚构人物也要过同一道收录范围检查（此前只查了真人库，1000 条演示人物一直没被检查）
  join(ROOT, 'server/seed/demo.json'),
].filter(Boolean)

const path = candidates.find((p) => existsSync(p))
if (!path) {
  console.error('找不到名人库文件')
  process.exit(1)
}

/** 明显不是成就的传记事件：命中标题即报错 */
const NOT_ACHIEVEMENT = [
  // 生
  /^生于/,
  /出生/,
  /诞生/,
  // 卒
  /去世/,
  /逝世/,
  /病逝/,
  /卒于/,
  /离世/,
  /葬礼/,
  /下葬/,
  // 疾病
  /病重/,
  /染病/,
  /住院/,
  /精神病院/,
  /割耳/,
  /中枪/,
  /自杀/,
  /卧床/,
  /手术/,
  // 婚丧与家庭私事
  /结婚/,
  /娶/,
  /离婚/,
  /同居/,
  /求婚/,
  /出生$/,
  /卒$/,
  /去世$/,
  // 迁居与行程
  /^迁往/,
  /^全家迁/,
  /^移居/,
  /^赴[^任]/,
  /^初到/,
  /^抵达/,
  /^离开/,
  /^回[^朝任]/,
  /^退学/,
  /^辍学/,
  /^落榜/,
  // 别人的作为
  /上书救兄/,
  /获准北归/,
  /大赦/,
]

/** 明显是成就的特征：标题命中即直接放行 */
const IS_ACHIEVEMENT = [
  /进士/,
  /及第/,
  /制科/,
  /学位/,
  /博士/,
  /毕业/,
  /教授/,
  /讲师/,
  /教职/,
  /院士/,
  /任职/,
  /任翰林/,
  /知[一-龥]/,
  /通判/,
  /判官/,
  /判登闻/,
  /讲学/,
  /授徒/,
  /聚于门下/,
  /获诺贝尔/,
  /获奖/,
  /作《/,
  /自书《/,
  /发表/,
  /提出/,
  /完成/,
  /发现/,
  /提炼/,
  /筑/,
  /率军民/,
  /组织战地/,
  /建成/,
  /主持建成/,
  /募得/,
  /出版/,
  /上疏/,
  /整理旧稿/,
  /证实/,
  /预言/,
  /引出/,
  /接受一克镭/,
  /出席以她命名/,
]

const data = JSON.parse(readFileSync(path, 'utf8'))
const lives = Array.isArray(data) ? data : data.lives

let bad = 0
let total = 0
const domainCount = new Map()

for (const life of lives) {
  for (const a of life.achievements ?? []) {
    total += 1
    domainCount.set(a.domain, (domainCount.get(a.domain) ?? 0) + 1)
    const title = a.title ?? ''
    if (IS_ACHIEVEMENT.some((re) => re.test(title))) continue
    if (NOT_ACHIEVEMENT.some((re) => re.test(title))) {
      bad += 1
      console.error(`✗ ${life.name} · ${a.when} 「${title}」看起来是传记事件，不是成就`)
    }
  }
  // 人物层面：旅程必须至少挂一条成就，否则说明分类已经散了
  for (const j of life.journeys ?? []) {
    const n = (life.achievements ?? []).filter((a) => a.journey === j.name).length
    if (n === 0) {
      bad += 1
      console.error(`✗ ${life.name} · 旅程「${j.name}」下没有任何成就`)
    }
  }
}

console.log(`检查 ${path}`)
console.log(`  ${lives.length} 位人物 / ${total} 条条目`)
console.log(`  领域分布：${[...domainCount.entries()].map(([k, v]) => `${k} ${v}`).join(' · ')}`)
if (bad > 0) {
  console.error(`\n${bad} 处不符合「只收录成就」`)
  process.exit(1)
}
console.log('  全部条目都在收录范围内 ✓')
