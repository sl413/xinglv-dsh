import { bundledSeedLives } from './seedBundle'
import type { LifeDoc, LifeSummary } from './types'

/**
 * 群星列传的读取端
 * ---------------------------------------------------------------------------
 * 正常情况：从应用服务器的 /api/lives 读。
 * 降级情况：服务器不可用（例如把 dist 丢到纯静态托管上），
 *           就用构建时打进包里的初始名人库 —— 只读、能浏览，但登录与编辑不可用。
 *
 * 注意这里只有「读」。写入全部在 admin.ts 里，并且需要管理员会话。
 * 无论哪条路径，个人成就都不会经过这个模块。
 */

export interface LivesPayload {
  lives: LifeSummary[]
  source: 'server' | 'bundled'
  error?: string
}

const bundledLives: LifeDoc[] = bundledSeedLives

export function bundledList(): LifeSummary[] {
  return bundledLives.map(summaryOf).sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

export function bundledDoc(id: string): LifeDoc | null {
  return bundledLives.find((l) => l.id === id) ?? null
}

export function summaryOf(life: LifeDoc): LifeSummary {
  return {
    id: life.id,
    name: life.name,
    tagline: life.tagline,
    birthYear: life.birthYear,
    deathYear: life.deathYear,
    span: spanOf(life.birthYear, life.deathYear),
    summary: life.summary,
    achievementCount: life.achievements.length,
    journeyCount: life.journeys.length,
    fictional: life.fictional === true,
    updatedAt: life.updatedAt,
    published: life.published,
  }
}

export function spanOf(b: number | null, d: number | null): string {
  if (b == null && d == null) return ''
  if (b != null && d != null) return `${yearText(b)}–${yearText(d)}`
  if (b != null) return `${yearText(b)}–`
  return `–${yearText(d as number)}`
}

function yearText(y: number): string {
  return y < 0 ? `前${-y}` : `${y}`
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'same-origin', ...init })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* 非 JSON 响应 */
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `请求失败（${res.status}）`
    throw new Error(message)
  }
  return data as T
}

/** 公开：人物列表。服务器优先，失败则回落到内置名人库。 */
export async function fetchLives(): Promise<LivesPayload> {
  try {
    const data = await getJson<{ lives: LifeSummary[] }>('/api/lives')
    if (!Array.isArray(data?.lives)) throw new Error('返回格式不对')
    return { lives: data.lives, source: 'server' }
  } catch (err) {
    return {
      lives: bundledList(),
      source: 'bundled',
      error: err instanceof Error ? err.message : '无法连接服务器',
    }
  }
}

/** 公开：某个人物的完整生平 */
export async function fetchLife(id: string): Promise<{ life: LifeDoc; source: 'server' | 'bundled' }> {
  try {
    const data = await getJson<{ life: LifeDoc }>(`/api/lives/${encodeURIComponent(id)}`)
    if (!data?.life) throw new Error('返回格式不对')
    return { life: data.life, source: 'server' }
  } catch (err) {
    const local = bundledDoc(id)
    if (local) return { life: local, source: 'bundled' }
    throw err
  }
}

export { getJson }
