import { getJson } from './api'
import type { LifeDoc, LifeSummary } from './types'

/**
 * 群星列传 · 管理端接口
 * ---------------------------------------------------------------------------
 * 只有登录后的站长能调用。服务器会独立校验权限 ——
 * 前端把按钮藏起来只是体验，真正的守门人在 server/server.mjs 里。
 */

export interface AdminSession {
  admin: boolean
}

export async function fetchSession(): Promise<AdminSession> {
  return getJson<AdminSession>('/api/session')
}

export async function login(password: string): Promise<void> {
  await getJson('/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
}

export async function logout(): Promise<void> {
  await getJson('/api/session', { method: 'DELETE' })
}

export async function changePassword(current: string, next: string): Promise<void> {
  await getJson('/api/admin/password', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ current, next }),
  })
}

/** 管理员看到的是包含「已撤下」的完整列表 */
export async function adminList(): Promise<Array<LifeSummary & { published: boolean }>> {
  const data = await getJson<{ lives: Array<LifeSummary & { published: boolean }> }>('/api/admin/lives')
  return data.lives
}

export async function adminGet(id: string): Promise<LifeDoc> {
  const data = await getJson<{ life: LifeDoc }>(`/api/admin/lives/${encodeURIComponent(id)}`)
  return data.life
}

/** 保存：新增或更新。保存成功后公开页面立刻能看到 —— 没有草稿态，也没有延迟发布。 */
export async function adminSave(life: LifeDoc, isNew: boolean): Promise<LifeDoc> {
  const body = JSON.stringify({
    id: life.id || undefined,
    name: life.name,
    tagline: life.tagline,
    summary: life.summary,
    birthYear: life.birthYear,
    deathYear: life.deathYear,
    provenance: life.provenance,
    importanceRule: life.importanceRule,
    published: life.published,
    // 必须带上：否则在管理端保存一次虚构人物，它就被悄悄变成「真人」了
    fictional: life.fictional === true,
    journeys: life.journeys,
    achievements: life.achievements,
  })
  const data = isNew
    ? await getJson<{ life: LifeDoc }>('/api/admin/lives', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
      })
    : await getJson<{ life: LifeDoc }>(`/api/admin/lives/${encodeURIComponent(life.id)}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
      })
  return data.life
}

export async function adminDelete(id: string): Promise<void> {
  await getJson(`/api/admin/lives/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 可恢复的历史版本（服务器每次落盘都会留一代） */
export async function adminBackups(): Promise<Array<{ name: string; at: string | null; count: number; size: number }>> {
  const data = await getJson<{ backups: Array<{ name: string; at: string | null; count: number; size: number }> }>(
    '/api/admin/backups',
  )
  return data.backups ?? []
}

/** 从某一代备份恢复整个名人库（删错了人物的反悔入口） */
export async function adminRestore(name = 'bak.1'): Promise<{ ok: boolean; before: number; after: number }> {
  return getJson('/api/admin/restore', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}
