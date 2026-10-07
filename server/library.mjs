// 星履 · 群星列传数据层
// ---------------------------------------------------------------------------
// 这里**只**读写 server/data/lives.json 一个文件。
// 它不知道、也不可能知道任何用户的个人成就 —— 个人成就从头到尾留在用户自己的浏览器里，
// 公开接口没有、也不需要读取它们的路径。这是本文件最重要的一条约束。
//
// 写入一律是「先写临时文件再 rename」，并在覆盖前留一份 .bak：
// 名人库是这个应用里唯一由服务器持有的内容，不该因为一次断电而丢掉。

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const DOMAIN_IDS = [
  'academy',
  'craft',
  'career',
  'relation',
  'journey',
  'passion',
  'family',
  'health',
  'creation',
  'unfiled',
]

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
/** 年份 / 年-月 / 年-月-日；允许负数年份（公元前） */
const WHEN_RE = /^-?\d{1,4}(-\d{1,2}(-\d{1,2})?)?$/
/** 保留几代备份：破坏性操作一次点击生效，只留一版等于没有第二道网 */
const MAX_BACKUPS = 5

export function slugify(name) {
  const ascii = String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // 中文名没有可用的 ASCII 形态：退化成拼音不可行，改用短哈希，保证仍然是 URL 安全的稳定 id
  if (ascii) return ascii.slice(0, 48)
  let h = 2166136261
  for (const ch of String(name)) {
    h ^= ch.codePointAt(0)
    h = Math.imul(h, 16777619)
  }
  return `life-${(h >>> 0).toString(36)}`
}

function str(v, max) {
  const s = typeof v === 'string' ? v.trim() : ''
  return s.length > max ? s.slice(0, max) : s
}

function intOrNull(v, min, max) {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  const i = Math.trunc(n)
  return i < min || i > max ? null : i
}

/** 把任意外部输入整理成一份可以安全落盘的档案；不合法的地方返回 error。 */
export function normalizeLife(input = {}, { isNew = false } = {}) {
  const name = str(input.name, 64)
  if (!name) return { error: '请填写姓名' }

  const id = ID_RE.test(String(input.id ?? '')) ? String(input.id) : isNew ? slugify(name) : ''
  if (!id || !ID_RE.test(id)) return { error: 'id 只能是小写字母、数字和连字符' }

  const birthYear = intOrNull(input.birthYear, -5000, 3000)
  const deathYear = intOrNull(input.deathYear, -5000, 3000)
  if (birthYear != null && deathYear != null && deathYear < birthYear) {
    return { error: '卒年不能早于生年' }
  }

  const journeys = []
  const seenJourney = new Set()
  for (const j of Array.isArray(input.journeys) ? input.journeys : []) {
    const jname = str(j?.name, 80)
    if (!jname || seenJourney.has(jname)) continue
    seenJourney.add(jname)
    const jid = ID_RE.test(String(j?.id ?? '')) ? String(j.id) : `jr-${slugify(jname)}`
    journeys.push({ id: jid, name: jname, domainHint: DOMAIN_IDS.includes(j?.domainHint) ? j.domainHint : undefined })
  }

  const achievements = []
  const seenIds = new Set()
  for (const a of Array.isArray(input.achievements) ? input.achievements : []) {
    const title = str(a?.title, 160)
    if (!title) return { error: `有一条成就没写名称` }
    const when = str(a?.when ?? a?.happenedAt, 12)
    if (!WHEN_RE.test(when)) return { error: `「${title}」的日期格式不对（可以只写年份，如 1037）` }
    let aid = ID_RE.test(String(a?.id ?? '')) ? String(a.id) : `ach-${slugify(title)}`
    while (seenIds.has(aid)) aid = `${aid}-${Math.random().toString(36).slice(2, 6)}`
    seenIds.add(aid)
    const domain = DOMAIN_IDS.includes(a?.domain) ? a.domain : 'unfiled'
    const journey = str(a?.journey, 80)
    achievements.push({
      id: aid,
      title,
      when,
      domain,
      pivotal: !!a?.pivotal,
      context: str(a?.context, 1200),
      source: str(a?.source, 300),
      journey: journey && seenJourney.has(journey) ? journey : undefined,
    })
  }

  achievements.sort((x, y) => (x.when < y.when ? -1 : x.when > y.when ? 1 : 0))

  return {
    life: {
      id,
      name,
      tagline: str(input.tagline, 120),
      summary: str(input.summary, 1200),
      birthYear,
      deathYear,
      provenance: str(input.provenance, 800),
      importanceRule: str(input.importanceRule, 800),
      published: input.published !== false,
      // 虚构人物会被显式标注：列表与人物星空上都要看得到「虚构」
      fictional: input.fictional === true,
      updatedAt: new Date().toISOString(),
      journeys,
      achievements,
    },
  }
}

/** 公开列表用的投影：只给浏览者需要的东西，不带上完整的生平文本。 */
export function toSummary(life) {
  return {
    id: life.id,
    name: life.name,
    tagline: life.tagline,
    birthYear: life.birthYear,
    deathYear: life.deathYear,
    span: spanOf(life),
    summary: life.summary,
    achievementCount: life.achievements.length,
    journeyCount: life.journeys.length,
    fictional: life.fictional === true,
    updatedAt: life.updatedAt,
  }
}

export function spanOf(life) {
  const b = life.birthYear
  const d = life.deathYear
  if (b == null && d == null) return ''
  if (b != null && d != null) return `${yearText(b)}–${yearText(d)}`
  if (b != null) return `${yearText(b)}–`
  return `–${yearText(d)}`
}

function yearText(y) {
  return y < 0 ? `前${-y}` : `${y}`
}

export class Library {
  /**
   * @param {string} dataDir 运行期数据目录
   * @param {string[]} seedPaths 播种用的文件；可以给多个（真人库 + 虚构演示人物），
   *        启动时按顺序合并 —— 虚构人物单独放一个文件，是为了不被打进前端的内置降级库。
   */
  constructor(dataDir, seedPaths) {
    this.dir = dataDir
    this.path = join(dataDir, 'lives.json')
    this.bakPath = join(dataDir, 'lives.json.bak')
    mkdirSync(dirname(this.path), { recursive: true })
    this.seeds = (Array.isArray(seedPaths) ? seedPaths : [seedPaths]).filter(Boolean)
    if (!existsSync(this.path)) {
      const merged = []
      const used = new Set()
      for (const seed of this.seeds) {
        if (!existsSync(seed)) continue
        try {
          const parsed = JSON.parse(readFileSync(seed, 'utf8'))
          const list = Array.isArray(parsed) ? parsed : parsed?.lives
          for (const raw of Array.isArray(list) ? list : []) {
            const { life } = normalizeLife(raw)
            if (!life || used.has(life.id)) continue
            used.add(life.id)
            merged.push(life)
          }
          console.log(`群星列传：播种 ${seed}（${merged.length} 位累计）`)
        } catch (err) {
          console.error(`群星列传：播种文件读不了 ${seed}`, err instanceof Error ? err.message : err)
        }
      }
      if (merged.length) {
        writeFileSync(this.path, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), lives: merged }, null, 2))
      }
    }
    this.lives = this.#read()
  }

  #read() {
    for (const p of [this.path, this.bakPath]) {
      try {
        const parsed = JSON.parse(readFileSync(p, 'utf8'))
        const list = Array.isArray(parsed) ? parsed : parsed?.lives
        if (Array.isArray(list)) {
          return list.map((l) => normalizeLife(l).life ?? l).filter(Boolean)
        }
      } catch {
        /* 换下一个候选 */
      }
    }
    return []
  }

  /**
   * 落盘 + 留多代备份。
   * ---------------------------------------------------------------------------
   * ★ 为什么不能只留一份 .bak：破坏性操作（删除人物）一次点击就生效，
   *   而唯一那份 .bak 下一次写入就被覆盖 —— 手滑一次就真的没有第二道网了。
   *   实测过：四位真人被逐个删除后，.bak 里只剩最后一位（只留了一版）。
   *   这里改成保留 MAX_BACKUPS 代（bak.1 最新 → bak.N 最旧），
   *   「从上一版恢复」就有东西可恢复。
   */
  #write() {
    const body = JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), lives: this.lives }, null, 2)
    const tmp = `${this.path}.${process.pid}.tmp`
    writeFileSync(tmp, body)
    try {
      if (existsSync(this.path)) {
        // 先把旧代往后挪一格，再把当前内容存成最新的 bak.1
        for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
          const older = `${this.path}.bak.${i}`
          const newer = `${this.path}.bak.${i + 1}`
          if (existsSync(older)) {
            try {
              renameSync(older, newer)
            } catch {
              /* 挪不动就跳过这一代 */
            }
          }
        }
        writeFileSync(`${this.path}.bak.1`, readFileSync(this.path))
        writeFileSync(this.bakPath, readFileSync(this.path)) // 兼容旧路径
      }
    } catch {
      /* 备份失败不阻塞主流程 */
    }
    renameSync(tmp, this.path)
  }

  /** 列出可恢复的历史版本（bak.1 最新） */
  backups() {
    const out = []
    for (let i = 1; i <= MAX_BACKUPS; i++) {
      const p = `${this.path}.bak.${i}`
      if (!existsSync(p)) continue
      try {
        const parsed = JSON.parse(readFileSync(p, 'utf8'))
        const list = Array.isArray(parsed) ? parsed : parsed?.lives
        out.push({ name: `bak.${i}`, at: parsed?.updatedAt ?? null, count: Array.isArray(list) ? list.length : 0, size: statSync(p).size })
      } catch {
        out.push({ name: `bak.${i}`, at: null, count: 0, size: statSync(p).size })
      }
    }
    return out
  }

  /**
   * 从某一代备份恢复整个名人库（默认最新一代 bak.1）。
   * 恢复前先把**当前**状态写成一份新的 bak.1 —— 也就是说「恢复」这个动作本身也可反悔。
   */
  restoreBackup(name = 'bak.1') {
    if (!/^bak\.[1-9]$/.test(name)) return { error: '备份名不合法' }
    const src = `${this.path}.${name}`
    if (!existsSync(src)) return { error: `没有这一代备份（${name}）` }
    let parsed
    try {
      parsed = JSON.parse(readFileSync(src, 'utf8'))
    } catch (err) {
      return { error: `这一代备份读不了：${err instanceof Error ? err.message : String(err)}` }
    }
    const list = Array.isArray(parsed) ? parsed : parsed?.lives
    if (!Array.isArray(list)) return { error: '这一代备份的内容不是人物列表' }
    const before = this.lives.length
    // 先把当前状态挪进历史（这样恢复本身也能再退回去）
    try {
      writeFileSync(`${this.path}.bak.restore`, readFileSync(this.path))
    } catch {
      /* 快照失败不阻塞 */
    }
    this.lives = list.map((l) => normalizeLife(l).life ?? l).filter(Boolean)
    this.#write()
    return { restored: name, before, after: this.lives.length }
  }

  /** 浏览者看到的：只包含已发布的人物 */
  publicList() {
    return this.lives.filter((l) => l.published).map(toSummary).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
  }

  /** 管理员看到的：包含已撤下的人物 */
  adminList() {
    return this.lives
      .map((l) => ({ ...toSummary(l), published: l.published }))
      .sort((a, b) => Number(b.published) - Number(a.published) || a.name.localeCompare(b.name, 'zh'))
  }

  get(id, { includeUnpublished = false } = {}) {
    const life = this.lives.find((l) => l.id === id)
    if (!life) return null
    if (!life.published && !includeUnpublished) return null
    return life
  }

  create(input) {
    const { life, error } = normalizeLife(input, { isNew: true })
    if (error) return { error }
    if (this.lives.some((l) => l.id === life.id)) return { error: `id「${life.id}」已经存在` }
    this.lives.push(life)
    this.#write()
    return { life }
  }

  update(id, input) {
    const idx = this.lives.findIndex((l) => l.id === id)
    if (idx < 0) return { error: '没有这个人物' }
    const { life, error } = normalizeLife({ ...input, id }, { isNew: false })
    if (error) return { error }
    this.lives[idx] = life
    this.#write()
    return { life }
  }

  remove(id) {
    const idx = this.lives.findIndex((l) => l.id === id)
    if (idx < 0) return { error: '没有这个人物' }
    const [gone] = this.lives.splice(idx, 1)
    this.#write()
    return { life: gone }
  }
}
