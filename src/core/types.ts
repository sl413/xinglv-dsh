/**
 * 星履 · 领域模型
 * ---------------------------------------------------------------------------
 * 这一层是纯粹的「人生数据」定义，不依赖任何渲染库。
 * 一次真实的经历 = 一颗星；一段成长路径 = 一条星轨；同一领域的一段时间 = 一个星座。
 */

export const SCHEMA_VERSION = 1 as const

/** 人生领域。颜色只表达「这属于人生的哪一部分」，不表达价值高低。 */
export type DomainId =
  | 'academy' // 学业
  | 'craft' // 技术
  | 'career' // 事业
  | 'relation' // 关系
  | 'journey' // 旅行
  | 'passion' // 兴趣
  | 'family' // 家庭
  | 'health' // 健康
  | 'creation' // 创作
  | 'unfiled' // 尚未归类

export type Importance = 1 | 2 | 3 | 4 | 5

/**
 * 共鸣度：这件事被多少人知道、理解、见证。
 * 它由用户自己定义，永远不由任何计数器决定 —— 星履没有点赞。
 * 0 = 只有我自己知道；5 = 被许多人共同见证。
 */
export type Resonance = 0 | 1 | 2 | 3 | 4 | 5

export interface Achievement {
  id: string
  /** 发生了什么 */
  title: string
  /** 什么时候发生（ISO 日期，YYYY-MM-DD 或完整 ISO） */
  happenedAt: string
  /** 为什么它对我重要 */
  reflection: string
  domain: DomainId
  /** 我自己定义的重要程度 */
  importance: Importance
  /** 被理解、见证与共鸣的程度（由我定义） */
  resonance: Resonance
  /** 见证者/同行者，可空 */
  witnesses?: string[]
  /** 所属成长路径 id */
  journeyId?: string
  /** 仅属于我的标签 */
  tags?: string[]
  createdAt: string
  updatedAt: string
  schemaVersion: number
}

export interface Journey {
  id: string
  name: string
  /** 这条路径最贴近的领域，仅用于配色倾向 */
  domainHint?: DomainId
  createdAt: string
}

export interface Archive {
  schemaVersion: number
  achievements: Achievement[]
  journeys: Journey[]
  createdAt: string
  updatedAt: string
  /**
   * 生平范围提示（可选）。
   * 群星列传里只收录成就，所以最早的条目往往晚于出生那年；
   * 时间轴要按生平展开，就把生卒年份放在这里，让前面几年空着。
   * 用户自己的档案不用它 —— 他的星空就是他记录的那些事。
   */
  spanHint?: { from?: string; to?: string }
}

/** 创作面板里正在写的东西。它是「草稿」，不是星。 */
export interface DraftInput {
  title: string
  happenedAt: string
  reflection: string
  domain: DomainId
  importance: Importance
  resonance: Resonance
  journeyName: string
  witnesses: string
  tags: string
  /** 用户是否已经展开「再完善一下」 */
  expanded: boolean
  updatedAt: number
}

export type ArchiveStatus =
  | 'idle' // 一切正常
  | 'saving'
  | 'saved'
  | 'unsaved' // 归档失败：内容仍在，允许重试
  | 'degraded' // 浏览器存储不可用，只能用内存 + 手动导出

export function emptyArchive(now = new Date()): Archive {
  const iso = now.toISOString()
  return { schemaVersion: SCHEMA_VERSION, achievements: [], journeys: [], createdAt: iso, updatedAt: iso }
}

export function emptyDraft(now = new Date()): DraftInput {
  return {
    title: '',
    happenedAt: toDateInput(now),
    reflection: '',
    domain: 'unfiled',
    importance: 3,
    resonance: 0,
    journeyName: '',
    witnesses: '',
    tags: '',
    expanded: false,
    updatedAt: Date.now(),
  }
}

export function draftHasContent(d: DraftInput | null | undefined): boolean {
  if (!d) return false
  return d.title.trim().length > 0 || d.reflection.trim().length > 0 || d.journeyName.trim().length > 0
}

export function toDateInput(d: Date): string {
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 尽量把用户输入/历史数据解析成一个可用时间戳；失败返回 null。 */
export function parseWhen(value: string | undefined | null): number | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  // "2019" / "2019-03" 也接受
  const m = /^(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/.exec(trimmed)
  if (m) {
    const y = Number(m[1])
    const mo = m[2] ? Number(m[2]) : 1
    const d = m[3] ? Number(m[3]) : 1
    const ts = new Date(y, mo - 1, d, 12, 0, 0).getTime()
    return Number.isFinite(ts) ? ts : null
  }
  const ts = Date.parse(trimmed)
  return Number.isFinite(ts) ? ts : null
}

export function formatWhen(value: string, style: 'full' | 'year' | 'month' = 'full'): string {
  const ts = parseWhen(value)
  if (ts == null) return value || '时间未记录'
  const d = new Date(ts)
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  if (style === 'year') return `${y}`
  // 只写到年或月的记录，不假装知道具体是哪一天
  const raw = value.trim()
  const precision: 'year' | 'month' | 'day' = /^\d{4}$/.test(raw) ? 'year' : /^\d{4}-\d{1,2}$/.test(raw) ? 'month' : 'day'
  if (style === 'month' || precision === 'month') return `${y} 年 ${mo} 月`
  if (precision === 'year') return `${y} 年`
  return `${y} 年 ${mo} 月 ${d.getDate()} 日`
}

export function formatAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 45) return '刚刚'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} 分钟前`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.round(h / 24)
  if (d < 31) return `${d} 天前`
  const mo = Math.round(d / 30)
  if (mo < 13) return `${mo} 个月前`
  return `${Math.round(mo / 12)} 年前`
}
