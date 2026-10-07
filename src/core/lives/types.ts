import type { Achievement, Archive, DomainId, Importance, Journey, Resonance } from '../types'
import { SCHEMA_VERSION } from '../types'

/**
 * 群星列传 · 数据类型
 * ---------------------------------------------------------------------------
 * 这里描述的是**服务器上那份公开名人库**的形状，和用户的个人档案是两套东西：
 *   · 个人档案：存在用户自己浏览器的 IndexedDB 里（src/data/），服务器永远看不到
 *   · 名人库：存在服务器的 server/data/lives.json 里，匿名可读、只有管理员能写
 * 两者只在「渲染」这一步汇合 —— 名人库会被转换成一个只读的 Archive 交给星空去画。
 */

export interface ServerJourney {
  id: string
  name: string
  domainHint?: DomainId
}

export interface ServerAchievement {
  id: string
  title: string
  /** 按实际录入精度保存：1037 / 1037-01 / 1037-01-08 */
  when: string
  domain: DomainId
  /** 是否决定性节点（界面上显示为「决定性节点 / 公开节点」，不是评分） */
  pivotal: boolean
  /** 第三人称的史实背景 */
  context: string
  /** 可选的资料来源，允许为空 */
  source: string
  journey?: string
}

export interface LifeDoc {
  id: string
  name: string
  tagline: string
  summary: string
  birthYear: number | null
  deathYear: number | null
  provenance: string
  importanceRule: string
  published: boolean
  /** 虚构人物：界面上要明确标出来，正文标题也从「史实背景」改成「虚构记录」 */
  fictional?: boolean
  updatedAt: string
  journeys: ServerJourney[]
  achievements: ServerAchievement[]
}

export interface LifeSummary {
  id: string
  name: string
  tagline: string
  birthYear: number | null
  deathYear: number | null
  span: string
  summary: string
  achievementCount: number
  journeyCount: number
  fictional?: boolean
  updatedAt: string
  published?: boolean
}

/** 空白的新人物：管理端点「新增」时用它当模板 */
export function emptyLife(): LifeDoc {
  return {
    id: '',
    name: '',
    tagline: '',
    summary: '',
    birthYear: null,
    deathYear: null,
    provenance:
      '本条目为离线整理，只使用年份级、流传较广的公开节点，未逐条核对，不作为史料引用。',
    importanceRule: '出生／代表作／重大转折／离世等决定性节点记为 4，其余公开节点记为 3；共鸣度不评分。',
    // 按「保存并公开」的语义：新建的人物保存后就是公开的（想撤下再关掉这个开关）
    published: true,
    updatedAt: new Date().toISOString(),
    journeys: [],
    achievements: [],
  }
}

export function emptyAchievement(): ServerAchievement {
  return { id: '', title: '', when: '', domain: 'unfiled', pivotal: false, context: '', source: '' }
}

/**
 * 把服务器上的人物文档编译成渲染层认识的 Archive。
 * 于是星空、星座、星轨、时间回溯、领域筛选、故事面板全部原样复用，一行渲染代码都不用改。
 */
export function archiveFromLife(life: LifeDoc): Archive {
  const journeyIds = new Map<string, string>()
  const journeys: Journey[] = life.journeys.map((j) => {
    journeyIds.set(j.name, j.id)
    return {
      id: j.id,
      name: j.name,
      domainHint: j.domainHint,
      createdAt: `${life.birthYear ?? 1000}-01-01T00:00:00.000Z`,
    }
  })

  const achievements: Achievement[] = life.achievements.map((a, i) => {
    const importance: Importance = (a.pivotal ? 4 : 3) as Importance
    // 共鸣度不评分：统一给占位值，界面上显示为「未评价」
    const resonance: Resonance = 3 as Resonance
    return {
      id: a.id || `ach_${life.id}_${i}`,
      title: a.title,
      happenedAt: a.when,
      reflection: a.context,
      domain: a.domain,
      importance,
      resonance,
      journeyId: a.journey ? journeyIds.get(a.journey) : undefined,
      createdAt: `${a.when.length === 4 ? `${a.when}-01-01` : a.when.length === 7 ? `${a.when}-01` : a.when}T12:00:00.000Z`,
      updatedAt: `${a.when.length === 4 ? `${a.when}-01-01` : a.when.length === 7 ? `${a.when}-01` : a.when}T12:00:00.000Z`,
      schemaVersion: SCHEMA_VERSION,
    }
  })

  achievements.sort((a, b) => (a.happenedAt < b.happenedAt ? -1 : a.happenedAt > b.happenedAt ? 1 : 0))

  const base = `${life.birthYear ?? 1000}-01-01T00:00:00.000Z`
  return {
    schemaVersion: SCHEMA_VERSION,
    achievements,
    journeys,
    createdAt: base,
    updatedAt: life.updatedAt,
    // 库里只有成就，最早一条往往晚于出生那年。时间轴按生平展开：
    // 前面空着的那几年本身就在说「他是从什么时候开始的」。
    spanHint: {
      from: life.birthYear != null ? `${life.birthYear}` : undefined,
      to: life.deathYear != null ? `${life.deathYear}` : undefined,
    },
  }
}

/** 把渲染层的年份精度转回服务器格式（管理端保存时用） */
export function precisionOf(when: string): 'year' | 'month' | 'day' | 'unknown' {
  const w = when.trim()
  if (/^-?\d{1,4}$/.test(w)) return 'year'
  if (/^-?\d{1,4}-\d{1,2}$/.test(w)) return 'month'
  if (/^-?\d{1,4}-\d{1,2}-\d{1,2}$/.test(w)) return 'day'
  return 'unknown'
}

export type { Achievement, Archive, DomainId, Journey }
