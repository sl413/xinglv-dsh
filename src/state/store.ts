import { create } from 'zustand'
import type { Archive, Achievement, ArchiveStatus, DomainId, DraftInput, Importance, Journey, Resonance } from '../core/types'
import { SCHEMA_VERSION, draftHasContent, emptyArchive, emptyDraft, parseWhen } from '../core/types'
import { inferDomain } from '../core/domains'
import { newId } from '../core/ids'
import { buildUniverse, type LifeUniverse } from '../core/layout'
import { isSampleArchive, sampleArchive } from '../core/sample'
import { LifeRepository, repository, upsertJourney, type SnapshotInfo } from '../data/repository'
import { cameraBus } from './bus'
import { STATIC_SITE } from '../core/buildMode'
import { detectQuality } from '../universe/quality'
import { archiveFromLife, type LifeDoc, type LifeSummary } from '../core/lives/types'
import { fetchLife, fetchLives } from '../core/lives/api'
import {
  adminDelete,
  adminList,
  adminSave,
  fetchSession,
  login as adminLogin,
  logout as adminLogout,
} from '../core/lives/admin'

export type AppPhase = 'loading' | 'entering' | 'ready'
export type QualityLevel = 'high' | 'balanced' | 'low'
export type ReadingTarget = { kind: 'star' | 'constellation' | 'overview' | 'path'; id: string } | null

export interface LightStarInput {
  title: string
  happenedAt: string
  reflection: string
  domain?: DomainId
  importance?: Importance
  resonance?: Resonance
  journeyName?: string
  witnesses?: string
  tags?: string
  /** 未指定领域时，允许从文字里猜一个 */
  autoDomain?: boolean
}

export interface Notice {
  kind: 'info' | 'saved' | 'error'
  text: string
  detail?: string
  at: number
}

interface LifeState {
  /* 数据 */
  archive: Archive
  universe: LifeUniverse
  repo: LifeRepository
  storageMode: 'indexeddb' | 'memory'
  status: ArchiveStatus
  lastSavedAt: number | null
  notice: Notice | null
  /** 归档失败时留在内存里的那一版（含用户刚写下的内容），用于重试 */
  unsavedArchive: Archive | null

  /* 草稿 */
  draft: DraftInput
  draftSavedAt: number | null
  draftRestored: boolean
  draftPersistTimer: number | null

  /* 观测 */
  obsTime: number

  /* 界面 */
  phase: AppPhase
  entered: boolean
  /** 本机档案是否已经读完。路由要等它，否则会跟 hydrate 抢着写 archive */
  hydrated: boolean
  quality: QualityLevel
  /** 用户（或地址栏参数）明确指定过画质后，就不再让自动降档覆盖它 */
  qualityLocked: boolean
  timeOpen: boolean
  /** 「人生领域」下拉是否展开 */
  domainOpen: boolean
  hoveredId: string | null
  reading: ReadingTarget
  /** 领域高亮：只看某一个人生领域时，其余星臂与星体退到很暗 */
  domainFocus: DomainId | null
  /** 镜头是否已经飞到目标（故事面板据此才浮现） */
  arrived: boolean

  /** 正在浏览的「群星列传」人物；null 表示看的是自己的星空 */
  viewingLife: LifeDoc | null
  /** 群星列传人物列表（公开数据） */
  lives: LifeSummary[]
  livesStatus: 'idle' | 'loading' | 'ready' | 'error'
  livesError: string | null
  /** 列表来自服务器，还是回落到随包内置的那一份 */
  livesSource: 'server' | 'bundled'
  /** 进入某人星空之前，先把用户自己的档案收好 */
  savedOwn: Archive | null

  /* 管理端：只有登录后的站长可用，服务器会独立校验 */
  admin: boolean
  adminBusy: boolean
  adminError: string | null
  adminOpen: boolean
  adminLives: Array<LifeSummary & { published: boolean }>
  editingLife: LifeDoc | null
  /** 是否显示星轨（关掉后星空里一根线都不剩） */
  trailsVisible: boolean
  focusedStarId: string | null
  focusedConstellationId: string | null
  composerOpen: boolean
  settingsOpen: boolean
  helpOpen: boolean
  /** 刚刚诞生的星：仪式结束后短暂显示一条克制的说明 */
  justBornStarId: string | null
  ceremony: { starId: string; token: number } | null
  bootStartedAt: number

  /* 动作 */
  hydrate: () => Promise<void>
  enter: () => void
  setPhase: (p: AppPhase) => void
  setQuality: (q: QualityLevel, lock?: boolean) => void

  patchDraft: (patch: Partial<DraftInput>) => void
  resetDraft: () => void
  discardDraft: () => void

  lightStar: (input: LightStarInput) => Promise<{ ok: boolean; id?: string; error?: string }>
  updateAchievement: (id: string, patch: Partial<Achievement> & { journeyName?: string }) => Promise<boolean>
  deleteAchievement: (id: string) => Promise<boolean>
  /** 批量删除（keepPanel 默认 true：面板不跳走，方便连着删） */
  deleteAchievements: (ids: string[], keepPanel?: boolean) => Promise<boolean>
  /** 撤销上一次删除 */
  undoLastDelete: () => Promise<boolean>
  /** 最近一次删除的内容（用于「撤销」） */
  lastDeleted: { achievements: Achievement[]; journeys: Journey[] } | null
  retryArchive: () => Promise<boolean>
  restoreSnapshot: (key: string) => Promise<boolean>
  /** 从示例星河一键退回「我自己的星空」（没有自己的快照就清空重来） */
  restoreMySky: () => Promise<boolean>
  loadSample: () => Promise<void>
  wipeAll: () => Promise<void>
  importArchive: (text: string, strategy: 'merge' | 'replace') => Promise<{ ok: boolean; error?: string; count?: number }>
  exportText: () => string
  dismissNotice: () => void

  setObsTime: (t: number) => void
  resetObsTime: () => void
  /** 自动播放：让整条时间轴自己往前走，像把这一生重看一遍 */
  obsPlaying: boolean
  /** 播放倍率（0.5 / 1 / 2 / 4） */
  obsSpeed: number
  setObsPlaying: (on: boolean) => void
  toggleObsPlay: () => void
  setObsSpeed: (x: number) => void
  /** 换下一档速度：读的是库里当前的值，不是渲染时的闭包 —— 连点两次要真的进两档 */
  cycleObsSpeed: () => void

  hoverStar: (id: string | null) => void
  openReading: (target: ReadingTarget) => void
  cameraArrived: () => void
  closeReading: () => void
  focusStar: (id: string) => void
  focusConstellation: (id: string) => void
  overviewCamera: () => void
  returnCamera: () => void
  openComposer: () => void
  closeComposer: () => void
  setSettingsOpen: (v: boolean) => void
  setHelpOpen: (v: boolean) => void
  toggleTime: () => void
  setDomainFocus: (d: DomainId | null) => void
  setDomainOpen: (v: boolean) => void
  openLife: (id: string) => Promise<void>
  closeLife: () => void
  loadLives: () => Promise<void>
  refreshSession: () => Promise<void>
  adminLogin: (password: string) => Promise<boolean>
  adminLogout: () => Promise<void>
  loadAdminLives: () => Promise<void>
  saveLife: (life: LifeDoc, isNew: boolean) => Promise<LifeDoc | null>
  removeLife: (id: string) => Promise<boolean>
  setEditingLife: (life: LifeDoc | null) => void
  setAdminOpen: (v: boolean) => void
  toggleTrails: () => void

  startCeremony: (starId: string) => void
  finishCeremony: () => void
  clearJustBorn: () => void
}

function layoutOf(archive: Archive): LifeUniverse {
  return buildUniverse(archive)
}

/** 首次进入时按设备能力选一个起点，之后由 PerformanceMonitor 动态调整 */
function detectInitialQuality(): QualityLevel {
  try {
    return detectQuality()
  } catch {
    return 'balanced'
  }
}

/** 地址栏可以显式指定画质（?q=high|balanced|low），指定后不再自动降档 */
function qualityFromUrl(): QualityLevel | null {
  if (typeof window === 'undefined') return null
  try {
    const q = new URLSearchParams(window.location.search).get('q')
    if (q === 'high' || q === 'balanced' || q === 'low') return q
  } catch {
    /* 忽略 */
  }
  return null
}

function nextArchive(archive: Archive, mutate: (a: Archive) => void): Archive {
  const copy: Archive = {
    schemaVersion: SCHEMA_VERSION,
    achievements: [...archive.achievements],
    journeys: [...archive.journeys],
    createdAt: archive.createdAt,
    updatedAt: new Date().toISOString(),
  }
  mutate(copy)
  return copy
}

export const useLife = create<LifeState>()((set, get) => {
  const bootstrap = emptyArchive()
  return {
    archive: bootstrap,
    universe: layoutOf(bootstrap),
    repo: repository,
    storageMode: 'indexeddb',
    status: 'idle',
    arrived: true,
    lastSavedAt: null,
    notice: null,
    unsavedArchive: null,
    lastDeleted: null,

    draft: emptyDraft(),
    draftSavedAt: null,
    draftRestored: false,
    draftPersistTimer: null,

    obsTime: 1,
    obsPlaying: false,
    obsSpeed: 1,

    phase: 'loading',
    entered: false,
    hydrated: false,
    quality: 'high',
    qualityLocked: false,
    timeOpen: true,
    hoveredId: null,
    reading: null,
    domainFocus: null,
    viewingLife: null,
    lives: [],
    livesStatus: 'idle',
    livesError: null,
    livesSource: 'server',
    savedOwn: null,
    admin: false,
    adminBusy: false,
    adminError: null,
    adminOpen: false,
    adminLives: [],
    editingLife: null,
    trailsVisible: true,
    domainOpen: false,
    focusedStarId: null,
    focusedConstellationId: null,
    composerOpen: false,
    settingsOpen: false,
    helpOpen: false,
    justBornStarId: null,
    ceremony: null,
    bootStartedAt: 0,

    async hydrate() {
      const repo = get().repo
      const mode = await repo.init()
      const [loaded, storedDraft] = await Promise.all([repo.loadArchive(), repo.loadDraft()])
      const draft = storedDraft?.draft ?? emptyDraft()
      const hasDraft = draftHasContent(draft)
      // 读本机档案是异步的。如果用户是直接打开某个分享地址（/life/xxx）进来的，
      // 「打开人物」可能已经先跑完了 —— 那时这里的 set 会把人物星空覆盖成他自己的（空）档案。
      // 所以：只在自己的星空里才写回 archive/universe。
      const viewing = get().viewingLife
      set({
        storageMode: mode,
        ...(viewing
          ? {}
          : {
              archive: loaded.archive,
              universe: layoutOf(loaded.archive),
            }),
        draft,
        draftSavedAt: storedDraft?.savedAt ?? null,
        draftRestored: hasDraft,
        bootStartedAt: performance.now() / 1000,
        timeOpen: true,
        // 已经有人生记录的人，不该再被当作「第一次来」——否则界面会整片隐掉
        entered: viewing ? true : loaded.archive.achievements.length > 0,
        // 直接进人物星空时，退出要能回到用户自己的档案，所以这里先替他收好
        savedOwn: viewing && !get().savedOwn ? loaded.archive : get().savedOwn,
        quality: qualityFromUrl() ?? detectInitialQuality(),
        qualityLocked: qualityFromUrl() != null,
        status: loaded.source === 'empty' ? 'idle' : 'saved',
        lastSavedAt: loaded.source === 'empty' ? null : Date.parse(loaded.archive.updatedAt) || Date.now(),
        hydrated: true,
      })
      if (mode === 'memory') {
        set({
          notice: {
            kind: 'info',
            text: '这台浏览器禁止了本地数据库',
            detail: '星履会把内容记在内存里，但请随时用「导出档案」保存一份到文件。',
            at: Date.now(),
          },
        })
      }
    },

    enter() {
      set({ entered: true })
    },
    setPhase(p) {
      set({ phase: p })
    },
    setQuality(q, lock = true) {
      set(lock ? { quality: q, qualityLocked: true } : { quality: q })
    },

    /* -------------------------------------------------------------- 草稿 */

    patchDraft(patch) {
      const draft: DraftInput = { ...get().draft, ...patch, updatedAt: Date.now() }
      set({ draft })
      const repo = get().repo
      // 同步落盘：这一步决定「关掉页面也不会丢」
      const ok = repo.saveDraftSync(draft)
      set({ draftSavedAt: Date.now(), draftRestored: true })
      if (!ok) {
        set({
          notice: {
            kind: 'error',
            text: '本机暂时写不进草稿',
            detail: '请勿关闭页面，可以直接提交；若归档也失败，请用「导出档案」保底。',
            at: Date.now(),
          },
        })
        return
      }
      // 异步冗余写一份到 IndexedDB（防 localStorage 被清理）
      const prev = get().draftPersistTimer
      if (prev != null) window.clearTimeout(prev)
      const timer = window.setTimeout(() => {
        void get().repo.saveDraftPersistent(get().draft)
        set({ draftPersistTimer: null })
      }, 600)
      set({ draftPersistTimer: timer })
    },

    resetDraft() {
      const draft = emptyDraft()
      set({ draft })
      get().repo.saveDraftSync(draft)
    },

    discardDraft() {
      const timer = get().draftPersistTimer
      if (timer != null) window.clearTimeout(timer)
      get().repo.clearDraft()
      set({ draft: emptyDraft(), draftSavedAt: null, draftRestored: false, draftPersistTimer: null })
    },

    /* -------------------------------------------------------- 点亮一颗星 */

    async lightStar(input) {
      if (get().viewingLife) return { ok: false, error: '正在参观「他人星河」：这里只能看。先回到我的星空，再记录属于你自己的星。' }
      const title = input.title.trim()
      if (!title) return { ok: false, error: '先写下发生了什么，哪怕只有几个字。' }
      if (parseWhen(input.happenedAt) == null) return { ok: false, error: '时间无法识别，可以写成 2019-03-05 或 2019。' }

      const domain: DomainId = input.domain ?? (input.autoDomain === false ? 'unfiled' : inferDomain(`${title} ${input.reflection}`).domain)
      const nowIso = new Date().toISOString()
      const { archive } = get()
      const { journeys, journeyId } = upsertJourney(archive.journeys, input.journeyName ?? '', domain)
      const achievement: Achievement = {
        id: newId('ach'),
        title,
        happenedAt: input.happenedAt,
        reflection: input.reflection.trim(),
        domain,
        importance: (input.importance ?? 3) as Importance,
        resonance: (input.resonance ?? 0) as Resonance,
        witnesses: splitList(input.witnesses),
        journeyId,
        tags: splitList(input.tags),
        createdAt: nowIso,
        updatedAt: nowIso,
        schemaVersion: SCHEMA_VERSION,
      }

      const candidate = nextArchive(archive, (a) => {
        a.achievements = [...a.achievements, achievement]
        a.journeys = journeys
      })

      set({ status: 'saving' })
      try {
        await get().repo.saveArchive(candidate)
        set({
          archive: candidate,
          universe: layoutOf(candidate),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: { kind: 'saved', text: '已归档', at: Date.now() },
        })
        // 只有确认归档成功之后，才清掉草稿
        get().discardDraft()
        get().startCeremony(achievement.id)
        return { ok: true, id: achievement.id }
      } catch (err) {
        // 归档失败：内容绝不丢 —— 草稿保留，同时把含新星的一版尽力镜像到本机
        await get().repo.mirrorArchive(candidate)
        set({
          status: 'unsaved',
          unsavedArchive: candidate,
          notice: {
            kind: 'error',
            text: '这颗星还没有安全归档',
            detail: describeError(err),
            at: Date.now(),
          },
        })
        return { ok: false, error: describeError(err) }
      }
    },

    async updateAchievement(id, patch) {
      if (get().viewingLife) return false
      const { archive } = get()
      const target = archive.achievements.find((a) => a.id === id)
      if (!target) return false
      let journeys = archive.journeys
      let journeyId = target.journeyId
      if (typeof patch.journeyName === 'string') {
        const trimmed = patch.journeyName.trim()
        if (!trimmed) {
          journeyId = undefined
        } else {
          const r = upsertJourney(journeys, trimmed, patch.domain ?? target.domain)
          journeys = r.journeys
          journeyId = r.journeyId
        }
      }
      const updated: Achievement = {
        ...target,
        ...patch,
        journeyId,
        updatedAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
      }
      if (!updated.title.trim()) updated.title = target.title
      const candidate = nextArchive(archive, (a) => {
        a.achievements = a.achievements.map((x) => (x.id === id ? updated : x))
        a.journeys = journeys
      })
      set({ status: 'saving' })
      try {
        await get().repo.saveArchive(candidate)
        set({
          archive: candidate,
          universe: layoutOf(candidate),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: { kind: 'saved', text: '已更新', at: Date.now() },
        })
        return true
      } catch (err) {
        await get().repo.mirrorArchive(candidate)
        set({
          status: 'unsaved',
          unsavedArchive: candidate,
          notice: { kind: 'error', text: '修改没能写进存档', detail: describeError(err), at: Date.now() },
        })
        return false
      }
    },

    async deleteAchievement(id) {
      const ok = await get().deleteAchievements([id], false)
      if (ok) set({ reading: null, focusedStarId: null })
      return ok
    },

    /**
     * 删除若干颗星。
     * -------------------------------------------------------------------------
     * 一次写入、一次快照 —— 批量删十颗不该产生十份快照把历史挤掉。
     * keepPanel=true 时不动面板：从「来时路」里连着删的时候，面板不该跳走。
     *
     * 同时**清掉因此变空的旅程**：一条 0 颗星的星轨没有意义，
     * 留着会在统计和星轨层里变成一个空壳。被清掉的旅程跟着 lastDeleted 一起留着，
     * 撤销时一并还回来。
     */
    async deleteAchievements(ids, keepPanel = true) {
      if (get().viewingLife) return false
      const idSet = new Set(ids)
      if (idSet.size === 0) return false
      const { archive } = get()
      const removed = archive.achievements.filter((a) => idSet.has(a.id))
      if (removed.length === 0) return false

      let orphanedJourneys: Journey[] = []
      const candidate = nextArchive(archive, (a) => {
        a.achievements = a.achievements.filter((x) => !idSet.has(x.id))
        const used = new Set(a.achievements.map((x) => x.journeyId).filter(Boolean))
        orphanedJourneys = a.journeys.filter((j) => !used.has(j.id))
        if (orphanedJourneys.length > 0) a.journeys = a.journeys.filter((j) => used.has(j.id))
      })

      try {
        await get().repo.saveArchive(candidate)
        set({
          archive: candidate,
          universe: layoutOf(candidate),
          status: 'saved',
          lastSavedAt: Date.now(),
          ...(keepPanel ? {} : { reading: null, focusedStarId: null }),
          lastDeleted: { achievements: removed, journeys: orphanedJourneys },
          notice: {
            kind: 'saved',
            text: removed.length === 1 ? '这颗星已经从星空中删除' : `已删除 ${removed.length} 颗星`,
            detail: '可以点下面的「撤销」找回来；历史快照里也留着。',
            at: Date.now(),
          },
        })
        if (!keepPanel) cameraBus.emit({ kind: 'overview' })
        return true
      } catch (err) {
        set({ notice: { kind: 'error', text: '删除没有写进存档', detail: describeError(err), at: Date.now() } })
        return false
      }
    },

    /** 撤销上一次删除：把星（以及因它变空的旅程）原样放回去 */
    async undoLastDelete() {
      if (get().viewingLife) return false
      const last = get().lastDeleted
      if (!last || last.achievements.length === 0) return false
      const back = new Set(last.achievements.map((a) => a.id))
      const candidate = nextArchive(get().archive, (a) => {
        const kept = a.achievements.filter((x) => !back.has(x.id))
        a.achievements = [...kept, ...last.achievements].sort((x, y) =>
          x.happenedAt < y.happenedAt ? -1 : x.happenedAt > y.happenedAt ? 1 : 0,
        )
        if (last.journeys.length > 0) {
          const have = new Set(a.journeys.map((j) => j.id))
          a.journeys = [...a.journeys, ...last.journeys.filter((j) => !have.has(j.id))]
        }
      })
      try {
        await get().repo.saveArchive(candidate)
        set({
          archive: candidate,
          universe: layoutOf(candidate),
          status: 'saved',
          lastSavedAt: Date.now(),
          lastDeleted: null,
          notice: {
            kind: 'saved',
            text: last.achievements.length === 1 ? '这颗星回来了' : `${last.achievements.length} 颗星回来了`,
            at: Date.now(),
          },
        })
        return true
      } catch (err) {
        set({ notice: { kind: 'error', text: '撤销没有写进存档', detail: describeError(err), at: Date.now() } })
        return false
      }
    },

    async retryArchive() {
      if (get().viewingLife) return false
      const pending = get().unsavedArchive
      if (!pending) return true
      set({ status: 'saving' })
      try {
        await get().repo.saveArchive(pending)
        set({
          archive: pending,
          universe: layoutOf(pending),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: { kind: 'saved', text: '已归档', at: Date.now() },
        })
        get().discardDraft()
        return true
      } catch (err) {
        set({
          status: 'unsaved',
          notice: { kind: 'error', text: '还是没能写进存档', detail: describeError(err), at: Date.now() },
        })
        return false
      }
    },

    /**
     * 「回到我自己的星空」。
     * -------------------------------------------------------------------------
     * 用户在示例星河里点了这个按钮时，他要的是「我原来那片」。
     * 于是从历史快照里找**最近的一份不是示例的**恢复；一份都没有，
     * 就如实告诉他「这里还没有你自己的记录」，并回到空白星空 ——
     * 而不是假装恢复成功、或悄悄给他另一片示例。
     */
    async restoreMySky() {
      if (get().viewingLife) return false
      let list: SnapshotInfo[] = []
      try {
        list = await get().repo.listSnapshots()
      } catch {
        list = []
      }
      const newestFirst = [...list].sort((a, b) => b.savedAt - a.savedAt)
      for (const snap of newestFirst) {
        const restored = await get().repo.readSnapshot(snap.key)
        if (!restored || isSampleArchive(restored)) continue
        return await get().restoreSnapshot(snap.key)
      }
      // 没有任何属于他自己的快照：那就不是「恢复」，而是「清空示例，重新开始」
      await get().wipeAll()
      return true
    },

    async restoreSnapshot(key) {
      if (get().viewingLife) return false
      const restored = await get().repo.readSnapshot(key)
      if (!restored) return false
      try {
        await get().repo.saveArchive(restored)
        set({
          archive: restored,
          universe: layoutOf(restored),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          reading: null,
          focusedStarId: null,
          focusedConstellationId: null,
          obsTime: 1,
          notice: { kind: 'saved', text: '已回到这份快照', at: Date.now() },
        })
        cameraBus.emit({ kind: 'overview' })
        return true
      } catch (err) {
        set({ notice: { kind: 'error', text: '恢复失败', detail: describeError(err), at: Date.now() } })
        return false
      }
    },

    async loadSample() {
      if (get().viewingLife) return
      const before = get().archive
      const hadOwn = before.achievements.length > 0 && !isSampleArchive(before)
      const sample = sampleArchive(new Date())
      try {
        await get().repo.saveArchive(sample)
        set({
          archive: sample,
          universe: layoutOf(sample),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: {
            kind: 'info',
            text: hadOwn ? '已切到示例星河' : '这是示例星河',
            detail: hadOwn
              ? '你自己那片已经自动留了一份快照，没有丢 —— 点顶部的「回到我的星空」就能回去。'
              : '它不属于任何人。随时可以在「档案」里一键清空，然后开始属于你自己的那片。',
            at: Date.now(),
          },
        })
        cameraBus.emit({ kind: 'overview' })
      } catch (err) {
        set({ notice: { kind: 'error', text: '示例星河写入失败', detail: describeError(err), at: Date.now() } })
      }
    },

    async wipeAll() {
      if (get().viewingLife) return
      const fresh = emptyArchive()
      try {
        await get().repo.saveArchive(fresh)
        get().discardDraft()
        set({
          archive: fresh,
          universe: layoutOf(fresh),
          status: 'saved',
          reading: null,
          focusedStarId: null,
          focusedConstellationId: null,
          justBornStarId: null,
          obsTime: 1,
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: { kind: 'info', text: '星空已空', detail: '上一版仍留在历史快照里。', at: Date.now() },
        })
        cameraBus.emit({ kind: 'overview' })
      } catch (err) {
        set({ notice: { kind: 'error', text: '清空失败', detail: describeError(err), at: Date.now() } })
      }
    },

    async importArchive(text, strategy) {
      if (get().viewingLife) return { ok: false, error: '正在参观「他人星河」：先回到我的星空再导入。' }
      try {
        const current = get().unsavedArchive ?? get().archive
        const next = get().repo.parseBundle(text, current, strategy)
        await get().repo.saveArchive(next)
        set({
          archive: next,
          universe: layoutOf(next),
          status: 'saved',
          lastSavedAt: Date.now(),
          unsavedArchive: null,
          notice: { kind: 'saved', text: `已导入 ${next.achievements.length} 颗星`, at: Date.now() },
        })
        cameraBus.emit({ kind: 'overview' })
        return { ok: true, count: next.achievements.length }
      } catch (err) {
        return { ok: false, error: describeError(err) }
      }
    },

    exportText() {
      return get().repo.exportBundle(get().unsavedArchive ?? get().archive)
    },

    dismissNotice() {
      set({ notice: null })
    },

    /* -------------------------------------------------------------- 时间 */

    setObsTime(t) {
      const clamped = Math.min(1, Math.max(0, t))
      set({ obsTime: clamped })
    },
    resetObsTime() {
      set({ obsTime: 1, obsPlaying: false })
      cameraBus.emit({ kind: 'timeDrift', t: 1 })
    },

    /**
     * 开始/停止自动播放。
     * -------------------------------------------------------------------------
     * 三个刻意的决定：
     *   1. **在终点按播放 = 从头再来**。停在最后时按播放什么都不发生会让人以为坏了。
     *   2. **开始时收起故事面板**：播放是「把这一生整体看一遍」，不是读某一颗星。
     *      两者同时发生会互相打断（星会随着时间回溯从面板里消失）。
     *   3. **走到最后就停**，不循环 —— 人生不走回头路，用户想看再按一次即可（会回到起点）。
     */
    setObsPlaying(on) {
      if (on) {
        const atEnd = get().obsTime >= 0.999
        set({
          obsPlaying: true,
          ...(atEnd ? { obsTime: 0 } : {}),
          reading: null,
          focusedStarId: null,
          focusedConstellationId: null,
        })
      } else {
        set({ obsPlaying: false })
      }
    },

    toggleObsPlay() {
      get().setObsPlaying(!get().obsPlaying)
    },

    setObsSpeed(x) {
      // 只接受四个档位，避免出现 0（那样播放看起来就是坏的）
      const allowed = [0.5, 1, 2, 4]
      const pick = allowed.reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), 1)
      set({ obsSpeed: pick })
    },

    cycleObsSpeed() {
      const allowed = [0.5, 1, 2, 4]
      const i = allowed.indexOf(get().obsSpeed)
      set({ obsSpeed: allowed[(i + 1) % allowed.length] })
    },

    /* -------------------------------------------------------------- 交互 */

    hoverStar(id) {
      if (get().hoveredId === id) return
      set({ hoveredId: id })
    },

    openReading(target) {
      // 不飞镜头的面板（来时路、星河概览）立刻显示；要飞的那些等镜头抵达
      const flies = target?.kind === 'star' || target?.kind === 'constellation'
      set({ reading: target, arrived: !flies })
      if (!target) return
      if (target.kind === 'star') {
        set({ focusedStarId: target.id, focusedConstellationId: null })
        cameraBus.emit({ kind: 'focusStar', id: target.id })
      } else if (target.kind === 'constellation') {
        set({ focusedConstellationId: target.id, focusedStarId: null })
        cameraBus.emit({ kind: 'focusConstellation', id: target.id })
      }
    },

    /** 由 CameraRig 在飞行结束的那一帧调用一次 */
    cameraArrived() {
      if (!get().arrived) set({ arrived: true })
    },

    closeReading() {
      set({ reading: null })
    },

    focusStar(id) {
      // 自动播放中点一颗星 = 我想读这一颗了 → 先停下时间，否则这颗星会随着回溯消失
      set({
        focusedStarId: id,
        reading: { kind: 'star', id },
        focusedConstellationId: null,
        arrived: false,
        obsPlaying: false,
      })
      cameraBus.emit({ kind: 'focusStar', id })
    },

    focusConstellation(id) {
      set({
        focusedConstellationId: id,
        focusedStarId: null,
        reading: { kind: 'constellation', id },
        arrived: false,
        obsPlaying: false,
      })
      cameraBus.emit({ kind: 'focusConstellation', id })
    },

    overviewCamera() {
      set({ focusedStarId: null, focusedConstellationId: null, arrived: false })
      cameraBus.emit({ kind: 'overview' })
    },

    returnCamera() {
      set({ focusedStarId: null, focusedConstellationId: null, reading: null, arrived: false })
      cameraBus.emit({ kind: 'returnHome' })
    },

    openComposer() {
      // 打开创作面板就意味着「已经进来了」：不该再和入口层叠在一起
      set({ composerOpen: true, entered: true })
    },
    closeComposer() {
      set({ composerOpen: false })
    },
    setSettingsOpen(v) {
      set({ settingsOpen: v })
    },
    setHelpOpen(v) {
      set({ helpOpen: v })
    },
    toggleTime() {
      set({ timeOpen: !get().timeOpen })
    },
    setDomainFocus(d) {
      set({ domainFocus: get().domainFocus === d ? null : d })
    },
    setDomainOpen(v) {
      set({ domainOpen: v })
    },

    /**
     * 打开群星列传里的某位人物。
     * 这是只读浏览：用户自己的档案先被完整收进 savedOwn，
     * 退出时原样放回 —— 看别人的人生不该碰到你自己的星空。
     * 人物来自服务器上的公开名人库；服务器不可用时回落到随包内置的那一份。
     */
    async openLife(id) {
      set({ livesStatus: get().livesStatus === 'ready' ? 'ready' : 'loading', notice: null })
      try {
        const { life, source } = await fetchLife(id)
        const archive = archiveFromLife(life)
        set({
          viewingLife: life,
          livesSource: source,
          savedOwn: get().savedOwn ?? get().archive,
          archive,
          universe: layoutOf(archive),
          reading: null,
          focusedStarId: null,
          focusedConstellationId: null,
          domainFocus: null,
          obsTime: 1,
          entered: true,
          livesStatus: 'ready',
        })
        cameraBus.emit({ kind: 'overview' })
      } catch (err) {
        set({
          livesStatus: 'error',
          livesError: err instanceof Error ? err.message : '读不到这位人物的资料',
        })
      }
    },

    closeLife() {
      const own = get().savedOwn
      set({
        viewingLife: null,
        savedOwn: null,
        archive: own ?? emptyArchive(),
        universe: layoutOf(own ?? emptyArchive()),
        reading: null,
        focusedStarId: null,
        focusedConstellationId: null,
        domainFocus: null,
        obsTime: 1,
      })
      cameraBus.emit({ kind: 'overview' })
    },

    /* -------------------------------------------------------- 群星列传 */

    async loadLives() {
      set({ livesStatus: 'loading', livesError: null })
      const payload = await fetchLives()
      set({
        lives: payload.lives,
        livesSource: payload.source,
        livesStatus: 'ready',
        livesError: payload.error ?? null,
      })
    },

    /* ---------------------------------------------------------- 管理端 */

    async refreshSession() {
      // 静态托管下没有会话这回事：连探都不探。
      // 原来无条件发 GET /api/session，线上每次访问都会 404 一次（白费往返、控制台留错）。
      if (STATIC_SITE) {
        set({ admin: false })
        return
      }
      try {
        const { admin } = await fetchSession()
        set({ admin })
      } catch {
        set({ admin: false })
      }
    },

    async adminLogin(password) {
      set({ adminBusy: true, adminError: null })
      try {
        await adminLogin(password)
        set({ admin: true, adminBusy: false })
        await get().loadAdminLives()
        return true
      } catch (err) {
        set({ adminBusy: false, adminError: err instanceof Error ? err.message : '登录失败' })
        return false
      }
    },

    async adminLogout() {
      try {
        await adminLogout()
      } catch {
        /* 服务器不可达时也要把本地状态清干净 */
      }
      set({ admin: false, adminLives: [], editingLife: null, adminError: null })
    },

    async loadAdminLives() {
      try {
        const lives = await adminList()
        set({ adminLives: lives, adminError: null })
      } catch (err) {
        set({ adminError: err instanceof Error ? err.message : '读不到名人库' })
      }
    },

    /** 保存：服务器写入成功后，公开列表立刻刷新 —— 保存即公开 */
    async saveLife(life, isNew) {
      set({ adminBusy: true, adminError: null })
      try {
        const saved = await adminSave(life, isNew)
        const lives = await fetchLives()
        set({
          adminBusy: false,
          editingLife: null,
          lives: lives.lives,
          livesSource: lives.source,
          adminLives: await adminList(),
          notice: { kind: 'info', text: `已保存「${saved.name}」，公开页面已更新`, at: Date.now() },
        })
        return saved
      } catch (err) {
        set({ adminBusy: false, adminError: err instanceof Error ? err.message : '保存失败' })
        return null
      }
    },

    async removeLife(id) {
      set({ adminBusy: true, adminError: null })
      try {
        await adminDelete(id)
        const lives = await fetchLives()
        set({
          adminBusy: false,
          editingLife: null,
          adminLives: await adminList(),
          lives: lives.lives,
          notice: { kind: 'info', text: '已删除该人物', at: Date.now() },
        })
        return true
      } catch (err) {
        set({ adminBusy: false, adminError: err instanceof Error ? err.message : '删除失败' })
        return false
      }
    },

    setEditingLife(life) {
      set({ editingLife: life, adminError: null })
    },

    setAdminOpen(v) {
      set({ adminOpen: v })
    },
    toggleTrails() {
      set({ trailsVisible: !get().trailsVisible })
    },

    /* -------------------------------------------------------------- 仪式 */

    startCeremony(starId) {
      const token = Date.now()
      set({ ceremony: { starId, token }, composerOpen: false, justBornStarId: null })
      cameraBus.emit({ kind: 'ceremonyDepart', starId })
    },

    finishCeremony() {
      const c = get().ceremony
      set({ ceremony: null, justBornStarId: c?.starId ?? null })
      cameraBus.emit({ kind: 'overview' })
    },

    clearJustBorn() {
      set({ justBornStarId: null })
    },
  }
})

function splitList(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  const parts = raw
    .split(/[,，、\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  return parts.length ? parts.slice(0, 12) : undefined
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

/** 页面被关闭/切走时，把草稿再同步落一次盘。 */
export function flushDraftOnExit(): void {
  const s = useLife.getState()
  if (draftHasContent(s.draft)) s.repo.saveDraftSync(s.draft)
}
