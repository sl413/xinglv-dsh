import type { Archive, Achievement, DraftInput, Journey } from '../core/types'
import { SCHEMA_VERSION, emptyArchive } from '../core/types'
import { newId } from '../core/ids'
import { lsDel, lsGet, lsSet, openStore, type KeyValueStore } from './kv'

/**
 * 星履 · 可靠存档
 * ---------------------------------------------------------------------------
 * 这一层的唯一目标是让人敢把重要的人生放在这里。为此：
 *
 *   1. 本地优先 —— 归档路径完全不依赖网络。没有网络，就没有因为网络而丢的可能。
 *   2. 双写 + 读回校验 —— 正式归档写入 IndexedDB 后立刻读回比对指纹，
 *      指纹不一致就当作「未归档」，界面如实呈现，绝不假装成功。
 *   3. 草稿永不拦路 —— 每一次输入先同步写进 localStorage（同步、不会因关页面丢失），
 *      再异步冗余写进 IndexedDB；只有正式归档被校验通过后，才会清掉草稿。
 *   4. 历史快照 —— 每次正式归档前留下上一版，最多保留 5 份，误删也能回来。
 */

const KEY_ARCHIVE = 'archive.v1'
const KEY_DRAFT = 'draft.v1'
const MIRROR_ARCHIVE = 'xinglv.mirror.archive.v1'
const MIRROR_DRAFT = 'xinglv.mirror.draft.v1'
const SNAP_PREFIX = 'snapshot.'
/** 镜像到 localStorage 的体积上限（字符数）。超过就不镜像，避免挤爆配额。 */
const MIRROR_LIMIT = 3_500_000
const MAX_SNAPSHOTS = 5

export interface StoredDraft {
  draft: DraftInput
  savedAt: number
}

export interface SnapshotInfo {
  key: string
  savedAt: number
  achievements: number
  updatedAt: string
}

export interface LoadResult {
  archive: Archive
  source: 'indexeddb' | 'mirror' | 'empty'
}

export class SaveFailedError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message)
    this.name = 'SaveFailedError'
  }
}

export function archiveFingerprint(a: Archive): string {
  let bytes = 0
  for (const x of a.achievements) bytes += x.title.length + x.reflection.length + 24
  return `${a.achievements.length}|${a.journeys.length}|${a.updatedAt}|${bytes}`
}

/** 导入护栏：外部 JSON 可能来自任何地方，必须在入口处挡住「大而无当」的输入 */
const MAX_IMPORT_ACHIEVEMENTS = 50000
const MAX_TITLE_LEN = 200
const MAX_REFLECTION_LEN = 20000
const MAX_JOURNEYS = 500

/**
 * 把任意外部输入整理成一份可以安全落盘的档案。
 *
 * ★ 两种模式，区别很重要：
 *   · strict = true（**只用于用户主动导入**）：超过护栏就抛错并说明是哪一项超了 ——
 *     用户需要一个明确的拒绝理由，而不是页面被一份大文件拖死。
 *   · 默认（内部读取、写盘读回校验）：**永远不因为护栏抛错**，也保持原有行为。
 *     否则一个记录很多的老用户会在 saveArchive 的读回校验处失败，变成「存不进去」——
 *     那是比导入过大严重得多的问题。
 */
function normalizeArchive(raw: unknown, opts: { strict?: boolean } = {}): Archive | null {
  const strict = opts.strict === true
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<Archive>
  if (!Array.isArray(r.achievements)) return null
  // ★ 条数上限：没有它，误导入一个几十万条的 JSON 会让 buildUniverse 直接卡死，
  //   而且用户看不到任何原因。宁可明确拒绝，也不要静默拖垮页面。
  if (strict && r.achievements.length > MAX_IMPORT_ACHIEVEMENTS) {
    throw new Error(`这份档案有 ${r.achievements.length} 条记录，超过上限 ${MAX_IMPORT_ACHIEVEMENTS} 条`)
  }
  const achievements: Achievement[] = []
  const seenIds = new Set<string>()
  for (const item of r.achievements) {
    const a = item as Partial<Achievement>
    if (!a || typeof a.id !== 'string' || typeof a.happenedAt !== 'string') continue
    // ★ id 去重：两条同 id 会让 universe.byId 与点星映射错位（点谁都打开同一颗星）
    if (seenIds.has(a.id)) continue
    seenIds.add(a.id)
    const title = typeof a.title === 'string' ? a.title : ''
    const reflection = typeof a.reflection === 'string' ? a.reflection : ''
    // ★ 长度上限：一条几 MB 的标题会毁掉布局与性能；超长判为非法而不是静默截断
    if (strict && title.length > MAX_TITLE_LEN) {
      throw new Error(`有一条记录的标题过长（${title.length} 字，上限 ${MAX_TITLE_LEN}）：「${title.slice(0, 24)}…」`)
    }
    if (strict && reflection.length > MAX_REFLECTION_LEN) {
      throw new Error(`「${title.slice(0, 24)}」的正文过长（${reflection.length} 字，上限 ${MAX_REFLECTION_LEN}）`)
    }
    achievements.push({
      id: a.id,
      title,
      happenedAt: a.happenedAt,
      reflection,
      domain: (a.domain ?? 'unfiled') as Achievement['domain'],
      importance: (clampInt(a.importance, 1, 5, 3) as Achievement['importance']),
      resonance: (clampInt(a.resonance, 0, 5, 0) as Achievement['resonance']),
      witnesses: Array.isArray(a.witnesses) ? a.witnesses.filter((w) => typeof w === 'string') : undefined,
      journeyId: typeof a.journeyId === 'string' ? a.journeyId : undefined,
      tags: Array.isArray(a.tags) ? a.tags.filter((t) => typeof t === 'string') : undefined,
      createdAt: typeof a.createdAt === 'string' ? a.createdAt : new Date().toISOString(),
      updatedAt: typeof a.updatedAt === 'string' ? a.updatedAt : new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
    })
  }
  const journeys: Journey[] = (Array.isArray(r.journeys) ? (r.journeys as Journey[]) : [])
    .filter((j) => j && typeof j.id === 'string' && typeof j.name === 'string')
    .slice(0, MAX_JOURNEYS)
  return {
    schemaVersion: SCHEMA_VERSION,
    achievements,
    journeys,
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : new Date().toISOString(),
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : new Date().toISOString(),
  }
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof v === 'number' ? Math.round(v) : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.min(hi, Math.max(lo, n))
}

export class LifeRepository {
  private kv: KeyValueStore | null = null
  private lastKnown: Archive | null = null

  get mode(): 'indexeddb' | 'memory' {
    return this.kv?.kind ?? 'memory'
  }

  async init(): Promise<'indexeddb' | 'memory'> {
    this.kv = await openStore()
    return this.kv.kind
  }

  /* ------------------------------------------------------------- 归档读取 */

  async loadArchive(): Promise<LoadResult> {
    const fromDb = await this.readFromDb()
    if (fromDb) {
      this.lastKnown = fromDb
      const mirror = lsGet<Archive>(MIRROR_ARCHIVE)
      // 若镜像比库里更新（例如上次写库失败但镜像成功），以更新的那份为准
      const m = normalizeArchive(mirror)
      if (m && Date.parse(m.updatedAt) > Date.parse(fromDb.updatedAt)) {
        return { archive: m, source: 'mirror' }
      }
      return { archive: fromDb, source: 'indexeddb' }
    }
    const mirror = normalizeArchive(lsGet<Archive>(MIRROR_ARCHIVE))
    if (mirror) {
      this.lastKnown = mirror
      // 顺手把镜像补回主库
      if (this.kv && this.kv.kind === 'indexeddb') {
        void this.kv.set(KEY_ARCHIVE, mirror).catch(() => undefined)
      }
      return { archive: mirror, source: 'mirror' }
    }
    return { archive: emptyArchive(), source: 'empty' }
  }

  private async readFromDb(): Promise<Archive | null> {
    if (!this.kv) return null
    try {
      const raw = await this.kv.get<unknown>(KEY_ARCHIVE)
      return normalizeArchive(raw)
    } catch {
      return null
    }
  }

  /* ------------------------------------------------------------- 归档写入 */

  /**
   * 正式归档：写库 → 读回校验指纹 → 写镜像。
   * 校验不通过会抛出 SaveFailedError，调用方必须如实告诉用户「还没存住」。
   */
  async saveArchive(archive: Archive): Promise<{ fingerprint: string; bytes: number }> {
    const next: Archive = { ...archive, schemaVersion: SCHEMA_VERSION, updatedAt: new Date().toISOString() }
    const fingerprint = archiveFingerprint(next)
    const bytes = JSON.stringify(next).length

    if (this.lastKnown && this.lastKnown.achievements.length > 0) {
      await this.writeSnapshot(this.lastKnown)
    }

    if (this.kv && this.kv.kind === 'indexeddb') {
      try {
        await this.kv.set(KEY_ARCHIVE, next)
      } catch (err) {
        // 主库失败：仍尽力写镜像，并把失败如实抛出
        lsSet(MIRROR_ARCHIVE, next)
        throw new SaveFailedError('浏览器数据库写入失败', err)
      }
      let readBack: Archive | null = null
      try {
        readBack = normalizeArchive(await this.kv.get<unknown>(KEY_ARCHIVE))
      } catch (err) {
        throw new SaveFailedError('归档写入后无法读回校验', err)
      }
      if (!readBack || archiveFingerprint(readBack) !== fingerprint) {
        throw new SaveFailedError('归档读回校验不一致')
      }
      this.lastKnown = readBack
    } else {
      // 无 IndexedDB：退化为 localStorage 镜像 + 内存
      if (!lsSet(MIRROR_ARCHIVE, next)) {
        throw new SaveFailedError('本机存储不可写（可能已满或处于无痕模式）')
      }
      this.lastKnown = next
    }

    if (bytes <= MIRROR_LIMIT) lsSet(MIRROR_ARCHIVE, next)
    await this.pruneSnapshots()
    return { fingerprint, bytes }
  }

  /** 仅写镜像的轻量保底（用于正式归档失败后的兜底，不抛错）。 */
  async mirrorArchive(archive: Archive): Promise<boolean> {
    const next: Archive = { ...archive, schemaVersion: SCHEMA_VERSION }
    const ok = lsSet(MIRROR_ARCHIVE, next)
    if (ok && this.kv && this.kv.kind === 'indexeddb') {
      try {
        await this.kv.set(KEY_ARCHIVE, next)
      } catch {
        /* 忽略：镜像已成功，下次启动会自动补写主库 */
      }
    }
    return ok
  }

  /* --------------------------------------------------------------- 快照 */

  private async writeSnapshot(a: Archive): Promise<void> {
    if (!this.kv) return
    const savedAt = Date.now()
    const key = `${SNAP_PREFIX}${savedAt}`
    try {
      await this.kv.set(key, { archive: a, savedAt })
    } catch {
      /* 快照失败不影响主流程 */
    }
  }

  async listSnapshots(): Promise<SnapshotInfo[]> {
    if (!this.kv) return []
    try {
      const keys = await this.kv.keys(SNAP_PREFIX)
      const out: SnapshotInfo[] = []
      for (const key of keys) {
        const rec = await this.kv.get<{ archive: Archive; savedAt: number }>(key)
        if (!rec?.archive) continue
        out.push({ key, savedAt: rec.savedAt ?? 0, achievements: rec.archive.achievements.length, updatedAt: rec.archive.updatedAt })
      }
      return out.sort((a, b) => b.savedAt - a.savedAt)
    } catch {
      return []
    }
  }

  async readSnapshot(key: string): Promise<Archive | null> {
    if (!this.kv) return null
    try {
      const rec = await this.kv.get<{ archive: Archive }>(key)
      return normalizeArchive(rec?.archive) ?? null
    } catch {
      return null
    }
  }

  private async pruneSnapshots(): Promise<void> {
    if (!this.kv) return
    const list = await this.listSnapshots()
    for (const s of list.slice(MAX_SNAPSHOTS)) {
      try {
        await this.kv.del(s.key)
      } catch {
        /* 忽略 */
      }
    }
  }

  /* --------------------------------------------------------------- 草稿 */

  /**
   * 同步写草稿。每一次输入都会走这里 —— 关掉页面也不会丢。
   * 之所以用 localStorage：它是同步的，浏览器杀进程之前一定会落盘。
   */
  saveDraftSync(draft: DraftInput): boolean {
    return lsSet(MIRROR_DRAFT, { draft, savedAt: Date.now() } satisfies StoredDraft)
  }

  /** 冗余写一份到 IndexedDB（异步，防 localStorage 被清）。 */
  async saveDraftPersistent(draft: DraftInput): Promise<void> {
    if (!this.kv) return
    try {
      await this.kv.set(KEY_DRAFT, { draft, savedAt: Date.now() } satisfies StoredDraft)
    } catch {
      /* 忽略：同步那份已经写好了 */
    }
  }

  async loadDraft(): Promise<StoredDraft | null> {
    const local = lsGet<StoredDraft>(MIRROR_DRAFT)
    let remote: StoredDraft | null = null
    if (this.kv) {
      try {
        remote = (await this.kv.get<StoredDraft>(KEY_DRAFT)) ?? null
      } catch {
        remote = null
      }
    }
    const candidates = [local, remote].filter((x): x is StoredDraft => !!x?.draft)
    if (candidates.length === 0) return null
    candidates.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
    return candidates[0]
  }

  clearDraft(): void {
    lsDel(MIRROR_DRAFT)
    if (this.kv) void this.kv.del(KEY_DRAFT).catch(() => undefined)
  }

  /* ------------------------------------------------------------ 导出导入 */

  exportBundle(archive: Archive): string {
    return JSON.stringify(
      {
        app: 'xinglv',
        schemaVersion: SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        achievements: archive.achievements,
        journeys: archive.journeys,
        createdAt: archive.createdAt,
      },
      null,
      2,
    )
  }

  /** 解析导入文件；merge 时按 id 去重，保留 updatedAt 较新的那份。 */
  parseBundle(text: string, current: Archive, strategy: 'merge' | 'replace'): Archive {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('这个文件不是有效的星履档案（JSON 解析失败）')
    }
    const obj = raw as { app?: string; achievements?: unknown; journeys?: unknown }
    if (obj?.app && obj.app !== 'xinglv') throw new Error('这个文件不属于星履')
    // ★ 这是用户主动导入的路径 —— 传 strict，让护栏把「太大/太长」明确拒掉并说明原因
    const incoming = normalizeArchive(
      {
        schemaVersion: SCHEMA_VERSION,
        achievements: obj?.achievements,
        journeys: obj?.journeys,
        createdAt: (raw as { createdAt?: string }).createdAt,
        updatedAt: new Date().toISOString(),
      },
      { strict: true },
    )
    if (!incoming) throw new Error('档案内容无法识别')
    if (strategy === 'replace') return incoming
    const byId = new Map(current.achievements.map((a) => [a.id, a]))
    for (const a of incoming.achievements) {
      const prev = byId.get(a.id)
      if (!prev || Date.parse(a.updatedAt) >= Date.parse(prev.updatedAt)) byId.set(a.id, a)
    }
    const journeyById = new Map(current.journeys.map((j) => [j.id, j]))
    for (const j of incoming.journeys) if (!journeyById.has(j.id)) journeyById.set(j.id, j)
    return {
      schemaVersion: SCHEMA_VERSION,
      achievements: [...byId.values()],
      journeys: [...journeyById.values()],
      createdAt: current.createdAt,
      updatedAt: new Date().toISOString(),
    }
  }

  close(): void {
    this.kv?.close()
  }
}

/* ----------------------------------------------------------- 领域辅助 */

export function upsertJourney(journeys: Journey[], name: string, domainHint?: Journey['domainHint']): { journeys: Journey[]; journeyId?: string } {
  const trimmed = name.trim()
  if (!trimmed) return { journeys }
  const found = journeys.find((j) => j.name === trimmed)
  if (found) return { journeys, journeyId: found.id }
  const created: Journey = { id: newId('jr'), name: trimmed, domainHint, createdAt: new Date().toISOString() }
  return { journeys: [...journeys, created], journeyId: created.id }
}

export const repository = new LifeRepository()
