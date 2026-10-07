import type { Achievement, Archive, DomainId, Journey } from './types'
import { parseWhen } from './types'
import { CORE_DOMAINS, DOMAIN_COUNT, DOMAIN_INDEX, domainAccentLinear, domainDef, domainLinear, srgbToLinear } from './domains'
import { clamp, clamp01, gaussian, hash32, signed, unit } from './math'

/**
 * 星履 · 人生星河坐标学
 * ---------------------------------------------------------------------------
 * 这是整个应用的「天体力学」。它把一段人生映射成一片可以被漫游的三维星河，
 * 规则必须满足三件事：
 *   1. 稳定 —— 同一段经历永远落在同一个位置（刷新、换设备都不移动）。
 *   2. 可读 —— 拉远镜头时，走过的路要能一眼看出来。
 *   3. 有纵深 —— 不是一张平面图，而是真的可以飞进去的空间。
 *
 * 映射规则：
 *   · 时间 t（0 = 记载的起点，1 = 此刻）→ 沿一条缓慢收拢的螺旋臂向外生长，
 *     所以「往回走」在视觉上就是「星河往里收缩」，时间就是宇宙本身的一维。
 *   · 领域 → 十条星臂的方位角。同一领域的人生事会排在同一条弧上，
 *     时间相近的自动聚成星团，进而结成星座。
 *   · 重要程度 → 星体大小；共鸣/被见证程度 → 亮度与外辉。
 *   · 高度 Y → 由时间与领域共同决定的缓慢起伏，让星河有真实的厚度。
 */

export const GALAXY = {
  /** 记载起点的半径（中心核球的一部分） */
  R0: 0.85,
  /** 此刻（最前沿）的半径 */
  R1: 11.8,
  /** 整段人生在螺旋上绕过的弧度 */
  WIND: 2.55,
  /** 半径对时间的非线性：>1 让早期经历向中心聚拢，堆出一颗明亮的核球 */
  RADIAL_POW: 1.15,
  /** 薄盘的高度起伏 */
  HEIGHT_A: 0.62,
  HEIGHT_B: 0.3,
  /** 星盘的缓慢波动，避免看起来像贴在平面上 */
  WARP: 0.1,
  /** 核球额外厚度倍率：越靠中心越厚 */
  BULGE: 1.75,
  /** 相机默认站位：约 25° 俯角，星盘接近水平横贯画面 */
  // 归位机位：整个项目只有这一处定义，CameraDirector 与启动编舞都从这里取。
  // 之前这三个常量是死代码（0 引用），真实机位硬编码在两处并互相覆盖 —— 调了等于没调。
  HOME_PHI: 0.82,
  HOME_THETA: 1.58,
  HOME_DIST: 10.6,
} as const

export interface TimeFrame {
  originMs: number
  endMs: number
  spanMs: number
}

export interface StarBody {
  id: string
  index: number
  achievement: Achievement
  position: [number, number, number]
  /** 光晕半径（世界单位），同时也决定拾取范围 */
  glow: number
  /** 星核紧致度 */
  core: number
  /** 亮度倍率：由共鸣度决定 */
  bright: number
  /** 外辉宽度 */
  halo: number
  /** 线性空间的星体颜色 */
  color: [number, number, number]
  /** 人生时间坐标 0..1 */
  time: number
  domain: DomainId
  /** 排序用的时间戳 */
  ms: number
}

export interface Constellation {
  id: string
  domain: DomainId
  memberIds: string[]
  memberIndex: number[]
  centroid: [number, number, number]
  radius: number
  tMin: number
  tMax: number
  yearA: number
  yearB: number
  label: string
  /**
   * 只含年份区间的短标注。
   * 主界面里的浮动标注用它 —— 星空中不该出现「家庭」「事业」这样的领域名，
   * 领域名只留在用户主动打开的面板里。
   */
  spanText: string
  /** 星座是否已经"成形"（成员>=3） */
  formed: boolean
}

export interface NebulaAnchor {
  id: string
  position: [number, number, number]
  size: number
  opacity: number
  seed: number
  tintA: [number, number, number]
  tintB: [number, number, number]
  puffs: number
  flatten: number
  spin: number
}

export interface TrailSpec {
  id: string
  journeyId: string
  name: string
  domain: DomainId
  points: [number, number, number][]
  tangents: [number, number, number][]
  times: number[]
  along: number[]
  width: number
  color: [number, number, number]
  /** 这段旅程里有多少次经历：越多，单条星轨越暗，避免糊成一张网 */
  memberCount: number
  headStarId: string
  headIndex: number
  headTime: number
}

export interface LifeStats {
  total: number
  byDomain: Record<string, number>
  firstMs: number | null
  lastMs: number | null
  spanYears: number
  constellationCount: number
  journeyCount: number
  brightest: string | null
}

/**
 * 一条人生星臂（＝一个领域走过的那段弧）。
 *
 * 「星臂辉光」是星河的**形态层**：它的亮度由这个领域真实的经历数量决定，
 * 没有经历的地方就是暗的。它让「我走过的路」读得出来，
 * 但它不是成就本身 —— 真正代表经历的是落在星臂上的那些锐利星点。
 */
export interface ArmGeometry {
  domain: DomainId
  /** 领域序号，与着色器里的分臂角一致 */
  index: number
  color: [number, number, number]
  accent: [number, number, number]
  /** 这个领域里的经历数量 */
  count: number
  /** 0..1 的辉光强度（由 count 决定） */
  strength: number
  tMin: number
  tMax: number
  /** 星臂中心线（无抖动） */
  samples: [number, number, number][]
}

/** 星河的「体量」：由真实记录数量决定，记得越多越厚越亮 */
export interface GalaxyDensity {
  total: number
  /** 星臂辉光总强度倍率 0..1 */
  gasScale: number
  /** 核球亮度倍率 0..1 */
  coreScale: number
  /** 盘面星尘数量 */
  dustCount: number
}

export interface LifeUniverse {
  frame: TimeFrame
  stars: StarBody[]
  byId: Map<string, number>
  constellations: Constellation[]
  nebulae: NebulaAnchor[]
  trails: TrailSpec[]
  trailsByStar: Map<string, string[]>
  arms: ArmGeometry[]
  density: GalaxyDensity
  stats: LifeStats
  /** 所有人生星的重心：取景时看向这里，而不是看向原点 */
  center: [number, number, number]
  /** 能装下所有人生星的半径（含边距），用于「拉远看整片星河」 */
  framing: number
  /** 星图的结构指纹：数据或时间框架变化时才会变，用于记忆化 */
  signature: string
}

/* ------------------------------------------------------------------ 时间框架 */

export function computeTimeFrame(
  achievements: Achievement[],
  nowMs = Date.now(),
  /**
   * 生平范围的提示。
   * 名人库里只收录成就，所以最早的条目往往不是出生那年（苏轼第一条是 1057 及第，他却生于 1037）。
   * 时间轴要按**生平**展开，于是把人物的生卒年份作为两端传进来 ——
   * 前面那几年空着，本身就说明了「他是从十九岁开始的」。
   */
  spanHint?: { from?: string; to?: string },
): TimeFrame {
  let minMs = Number.POSITIVE_INFINITY
  let maxMs = Number.NEGATIVE_INFINITY
  for (const a of achievements) {
    const ts = parseWhen(a.happenedAt)
    if (ts == null) continue
    if (ts < minMs) minMs = ts
    if (ts > maxMs) maxMs = ts
  }
  const hintFrom = spanHint?.from ? parseWhen(spanHint.from) : null
  const hintTo = spanHint?.to ? parseWhen(spanHint.to) : null
  if (hintFrom != null && hintFrom < minMs) minMs = hintFrom
  if (hintTo != null && hintTo > maxMs) maxMs = hintTo
  if (!Number.isFinite(minMs)) {
    minMs = new Date(new Date(nowMs).getFullYear(), 0, 1).getTime()
    maxMs = minMs
  }
  const originMs = new Date(new Date(minMs).getFullYear(), 0, 1).getTime()
  const now = new Date(nowMs)
  const nowD = now.getTime()
  // 末端对齐到「下个月 1 号」：让星图在一个月内保持完全静止（避免每天微动）
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime()
  const span0 = Math.max(1, maxMs - originMs)
  // 记录停在很久以前的档案（例如群星列传里的历史人物），
  // 末端就用最后一条记录，而不是「此刻」—— 否则六十几年的人生会被压进一个极小的内圈。
  //
  // 注意：末端余量要按「有没有生平范围提示」分开处理。
  // 传记人物的跨度可能近百年，若还按跨度的 5% 留余量，末端会被推出去四五年，
  // 甚至越过「这是历史档案」的判定线 —— 于是一个 2020 年结束的人生，时间轴右端会写成「此刻」。
  const endMs = spanHint?.to
    ? Math.max(maxMs, hintTo ?? maxMs) + 366 * 86400000
    : maxMs >= nowD - 2 * 365 * 86400000
      ? Math.max(nextMonth, maxMs + 86400000, originMs + 366 * 86400000)
      : Math.max(maxMs + span0 * 0.05, originMs + 366 * 86400000)
  return { originMs, endMs, spanMs: endMs - originMs }
}

export function tOfMs(ms: number, frame: TimeFrame): number {
  return clamp01((ms - frame.originMs) / (frame.spanMs || 1))
}

export function msOfT(t: number, frame: TimeFrame): number {
  return frame.originMs + clamp01(t) * frame.spanMs
}

/* --------------------------------------------------------------- 星臂几何学 */

const TWO_PI = Math.PI * 2

function armAngle(i: number): number {
  // 均匀分臂 + 一点不规则，避免看起来像机械的十等分
  return (i * TWO_PI) / DOMAIN_COUNT + 0.33 * Math.sin(i * 2.13)
}
function armRadialBias(i: number): number {
  return 0.36 * Math.sin(i * 2.71) - 0.1
}
function armHeightPhase(i: number): number {
  return i * 1.37
}

/** 半径 → 时间 的近似反函数：供星云/星尘按「时间半径」做结构变化。 */
export function radiusAtTime(t: number): number {
  return GALAXY.R0 + (GALAXY.R1 - GALAXY.R0) * Math.pow(clamp01(t), GALAXY.RADIAL_POW)
}

/** 半径 → 时间 的精确反函数（与 radiusAtTime 互逆） */
export function timeAtRadius(r: number): number {
  const rn = clamp01((r - GALAXY.R0) / (GALAXY.R1 - GALAXY.R0))
  return Math.pow(rn, 1 / GALAXY.RADIAL_POW)
}

/** 核球：越靠中心，盘越厚 */
export function bulgeFactor(r: number): number {
  return 1 + GALAXY.BULGE * Math.exp(-r * 0.62)
}

export function armAngleAt(i: number): number {
  return armAngle(i)
}

/**
 * 一颗成就星的位置。
 * ---------------------------------------------------------------------------
 * 星臂是**统计上的密度脊**，不是一条排好队的曲线。
 * 原来角向抖动只有 ±0.062 rad（3.5°），而星臂间距是 36° ——
 * 实测一千颗星全部落在离脊线 0.1 rad 以内、没有一颗落在臂与臂之间，
 * 看起来就是十条串着珠子的细线，不像星空。
 *
 * 现在的模型：**三种族群** —— 星臂上密、臂肩渐疏、盘面上也有散落。
 *   · 星臂核心（54%）：贴着脊线，σ_arc≈0.95 —— 「这个领域主要长在这条臂上」仍然成立；
 *   · 臂肩（28%）：散布大得多，构成臂外围的晕；
 *   · 盘面散落（18%）：**角度彻底均匀**，铺在臂与臂之间，像真实星系的盘族。
 *
 * ★ 为什么只随机角度、不随机半径：**半径编码时间**。
 *   时间轴 ↔ 半径 是这个产品的核心语义（往回拉就是回到那一年），所以无论哪一族群，
 *   半径都必须锚在 t 上；能自由散落的只有方位角。
 *
 * 径向也做高斯散布，让「同一年」的星不再叠在同一个半径上。
 * 星臂的锐利结构由星云与盘面星尘那一层负责，所以星空整体依旧是螺旋的。
 */
export function starPositionAt(t: number, domainIndex: number, seed: number, jitter = 1): [number, number, number] {
  const baseR =
    GALAXY.R0 +
    (GALAXY.R1 - GALAXY.R0) * Math.pow(clamp01(t), GALAXY.RADIAL_POW) +
    armRadialBias(domainIndex)

  // 族群划分。jitter === 0 是「取星臂中心线」的调用（星云与盘面层要用它），
  // 那种情况必须老实落在脊线上，不参与散落。
  const pop = unit(seed, 11)
  const discField = jitter > 0 && pop >= 0.82
  const shoulder = pop >= 0.54 && pop < 0.82
  const arcSigma = discField ? 0 : shoulder ? 2.4 : 0.95
  const rSigma = discField ? 0.85 : shoulder ? 1.05 : 0.6
  // 限制到 ±2.6σ：否则靠近核心的星会被甩到盘面之外
  const gTheta = clamp(gaussian(seed, 2), -2.6, 2.6)
  const gRadius = clamp(gaussian(seed, 1), -2.6, 2.6)

  const r = baseR + gRadius * rSigma * (discField || shoulder ? 1 : jitter)
  // 盘面散落：角度均匀铺满整圈 —— 它不认星臂，但仍然待在「属于它的那一年」的环上
  const a = discField
    ? unit(seed, 12) * Math.PI * 2
    : armAngle(domainIndex) + GALAXY.WIND * t + (gTheta * arcSigma * jitter) / Math.max(1.2, baseR)

  const x = r * Math.cos(a)
  const z = r * Math.sin(a)
  const y =
    GALAXY.HEIGHT_A * Math.sin(t * 2.05 + armHeightPhase(domainIndex)) -
    GALAXY.HEIGHT_B * Math.cos(t * 1.13 + armHeightPhase(domainIndex) * 0.5) +
    0.34 * Math.sin(domainIndex * 1.9) +
    GALAXY.WARP * Math.sin(r * 0.55) +
    signed(seed, 3) * 0.34 * jitter * (discField ? 1.5 : shoulder ? 1.25 : 1) * bulgeFactor(r)
  return [x, y, z]
}

/* ------------------------------------------------------------------ 星体生成 */

function buildStar(a: Achievement, index: number, frame: TimeFrame, total: number): StarBody {
  const ms = parseWhen(a.happenedAt) ?? frame.originMs
  const t = tOfMs(ms, frame)
  const di = DOMAIN_INDEX[a.domain] ?? DOMAIN_INDEX.unfiled
  const seed = hash32(a.id)
  const position = starPositionAt(t, di, seed)

  // 重要程度 → 大小；共鸣度 → 亮度与外辉
  // 尺度和星河半径（约 10.6）是绑定关系：默认机位下最亮的星约 20px 光晕、
  // 最暗的约 8px，这样拉远看是一片星河，而不是一堆贴图。
  const imp = clamp(a.importance, 1, 5)
  const res = clamp(a.resonance ?? 0, 0, 5)
  // 过于拥挤的星空里，每颗星谦让一点亮度：一千颗星叠在一起时，
  // 加法混叠会把盘面糊成一片白，星臂结构反而看不见了。
  // 只压亮度与外辉，不压大小 —— 「重要程度 → 视觉分量」这条仍然成立。
  const crowd = clamp01((total - 120) / 700)
  const dim = 1 - 0.58 * crowd

  // 亮度层级：星臂上的星亮，盘面散落的星暗。
  // 这一条是「让盘面也散落成就星」的必要配套 —— 实测过一次教训：
  // 一千颗**同样亮**的星均匀铺满盘面，等于整片盘面均匀发亮，
  // 黑间隙全被填平（暗部占比从 11% 掉到 0.7%，画面发白）。
  // 真实星系也是这样：星臂上是年轻的亮星团，盘面上是暗淡的老年场星。
  const pop2 = unit(seed, 11)
  const fieldDim = pop2 >= 0.82 ? 0.42 : pop2 >= 0.54 ? 0.74 : 1
  const sizeDim = pop2 >= 0.82 ? 0.78 : pop2 >= 0.54 ? 0.92 : 1

  const glow = (0.1 + imp * 0.05 + res * 0.011) * sizeDim
  const core = clamp(1.42 - imp * 0.062, 0.8, 1.4)
  const bright = (0.62 + res * 0.122 + imp * 0.055) * dim * fieldDim
  const halo = (0.2 + res * 0.082 + imp * 0.012) * dim * fieldDim

  // 同领域内做一点点色相漂移，让星团不死板
  const base = domainLinear(a.domain)
  const alt = domainAccentLinear(a.domain)
  const k = 0.18 + unit(seed, 7) * 0.3
  const color: [number, number, number] = [
    base[0] + (alt[0] - base[0]) * k,
    base[1] + (alt[1] - base[1]) * k,
    base[2] + (alt[2] - base[2]) * k,
  ]

  return {
    id: a.id,
    index,
    achievement: a,
    position,
    glow,
    core,
    bright,
    halo,
    color,
    time: t,
    domain: a.domain,
    ms,
  }
}

function yearOf(ms: number): number {
  return new Date(ms).getFullYear()
}

/* -------------------------------------------------------------------- 星座 */

/** 一个「人生星座」最多几颗星。上限让密集档案也能切出可读的小团，而不是一整条臂当一个星座。 */
const MAX_CONSTELLATION_MEMBERS = 12

function buildConstellations(stars: StarBody[], frame: TimeFrame): Constellation[] {
  const byDomain = new Map<DomainId, StarBody[]>()
  for (const s of stars) {
    const list = byDomain.get(s.domain)
    if (list) list.push(s)
    else byDomain.set(s.domain, [s])
  }
  const out: Constellation[] = []
  for (const [domain, list] of byDomain) {
    list.sort((a, b) => a.ms - b.ms)
    let group: StarBody[] = []
    const flush = () => {
      if (group.length === 0) return
      out.push(makeConstellation(domain, group, frame, out.length))
      group = []
    }
    for (const s of list) {
      if (group.length > 0) {
        const prev = group[group.length - 1]
        const dt = s.time - prev.time
        // 成团规则：按「一段时间」切开，并给一团的人数设上限。
        // ★ 刻意不看「与上一颗星的距离」。星体散布是设计的一部分（星臂是密度脊，不是十条细线），
        //   用距离判断会在散布变大时把每一团都切碎 —— 实测小档案会一个星座都形不成（0 个）。
        if (group.length >= MAX_CONSTELLATION_MEMBERS || dt > 0.17) flush()
      }
      group.push(s)
    }
    flush()
  }
  // 有实体的星座排前面（>=3 颗）
  out.sort((a, b) => b.memberIds.length - a.memberIds.length)
  return out
}

function makeConstellation(domain: DomainId, members: StarBody[], _frame: TimeFrame, seq: number): Constellation {
  let cx = 0
  let cy = 0
  let cz = 0
  for (const m of members) {
    cx += m.position[0]
    cy += m.position[1]
    cz += m.position[2]
  }
  const n = members.length
  cx /= n
  cy /= n
  cz /= n
  let radius = 0
  for (const m of members) {
    const d = Math.hypot(m.position[0] - cx, m.position[1] - cy, m.position[2] - cz)
    if (d > radius) radius = d
  }
  const tMin = Math.min(...members.map((m) => m.time))
  const tMax = Math.max(...members.map((m) => m.time))
  const yearA = yearOf(members[0].ms)
  const yearB = yearOf(members[n - 1].ms)
  const spanText = yearA === yearB ? `${yearA}` : `${yearA}–${yearB}`
  const label = `${domainDef(domain).label} · ${spanText}`
  return {
    id: `con_${domain}_${seq}`,
    domain,
    memberIds: members.map((m) => m.id),
    memberIndex: members.map((m) => m.index),
    centroid: [cx, cy, cz],
    radius: radius + 0.7,
    tMin,
    tMax,
    yearA,
    yearB,
    spanText,
    label,
    formed: n >= 3,
  }
}

/* -------------------------------------------------------------------- 星云 */

const DEEP_INDIGO = srgbToLinear('#1b2450')
const MIST_CYAN = srgbToLinear('#4d7385')
const DUSK_VIOLET = srgbToLinear('#2a2438')
const DUSK_VIOLET_2 = srgbToLinear('#4a4258')
const AMBER_DIM = srgbToLinear('#6b5528')
const COLD_WHITE = srgbToLinear('#8fa3bd')

function mix3(a: [number, number, number], b: [number, number, number], k: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function buildNebulae(constellations: Constellation[]): NebulaAnchor[] {
  const out: NebulaAnchor[] = []

  // 1) 每个成形的星座背后，都有一小片属于这段人生的星云。
  //    只取最大的几片：星座一多，星云会互相叠加成一层灰雾，把深空糊掉。
  let used = 0
  for (const c of constellations) {
    if (c.memberIds.length < 4) continue
    if (used >= 8) break
    used++
    const seed = hash32(c.id)
    const d = domainLinear(c.domain)
    const a = domainAccentLinear(c.domain)
    out.push({
      id: `neb_${c.id}`,
      position: [c.centroid[0], c.centroid[1] - 0.35 + signed(seed, 3) * 0.5, c.centroid[2]],
      size: Math.min(11, c.radius * 1.7 + 2.4),
      opacity: clamp(0.1 + c.memberIds.length * 0.016, 0.1, 0.26),
      seed,
      tintA: mix3(DUSK_VIOLET, d, 0.42),
      tintB: mix3(MIST_CYAN, a, 0.28),
      puffs: 7 + (seed % 3),
      flatten: 0.5 + unit(seed, 4) * 0.3,
      spin: signed(seed, 5) * 0.35,
    })
  }

  // 2) 远景星云：让纵深一直延伸到看不见的地方。
  //    放得足够远，才不会在默认机位下糊成一层灰雾。
  const far: Array<[number, number, number, number, [number, number, number], [number, number, number]]> = [
    [28, 5.5, -22, 24, DEEP_INDIGO, MIST_CYAN],
    [-34, -7.5, 15, 30, DUSK_VIOLET_2, DEEP_INDIGO],
    [10, 10, 39, 27, MIST_CYAN, COLD_WHITE],
    [-23, 8, -36, 33, DUSK_VIOLET, DUSK_VIOLET_2],
    [44, -10.5, 7, 26, DEEP_INDIGO, mix3(DEEP_INDIGO, AMBER_DIM, 0.55)],
  ]
  far.forEach(([x, y, z, size, ta, tb], i) => {
    const seed = hash32(`far_nebula_${i}`)
    out.push({
      id: `neb_far_${i}`,
      position: [x, y, z],
      size,
      opacity: 0.1 + unit(seed, 1) * 0.07,
      seed,
      tintA: ta,
      tintB: tb,
      puffs: 8,
      flatten: 0.62,
      spin: signed(seed, 5) * 0.2,
    })
  })

  return out
}

/* -------------------------------------------------------------------- 星轨 */

const TRAIL_SAMPLES_PER_SEGMENT = 14

/** Catmull-Rom（centripetal），核心层自己实现，保持与渲染库解耦。 */
function catmullRom(p0: number[], p1: number[], p2: number[], p3: number[], t: number): [number, number, number] {
  const t2 = t * t
  const t3 = t2 * t
  const out: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    out[i] = 0.5 * (2 * p1[i] + (-p0[i] + p2[i]) * t + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2 + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
  }
  return out
}

function buildTrails(stars: StarBody[], journeys: Journey[]): TrailSpec[] {
  const byJourney = new Map<string, StarBody[]>()
  for (const s of stars) {
    const jid = s.achievement.journeyId
    if (!jid) continue
    const list = byJourney.get(jid)
    if (list) list.push(s)
    else byJourney.set(jid, [s])
  }
  const out: TrailSpec[] = []
  for (const j of journeys) {
    const list = byJourney.get(j.id)
    if (!list || list.length < 2) continue
    list.sort((a, b) => a.ms - b.ms)
    const seed = hash32(j.id)
    const ctrl: number[][] = list.map((s) => {
      // 让星轨不要贴着星体中心，稍微浮起来一点，从星的旁边经过
      const lift = 0.2 + 0.14 * unit(hash32(s.id), 11)
      return [s.position[0], s.position[1] + lift, s.position[2]]
    })
    // 端点外推，保证首尾曲率自然
    const head = ctrl[0]
    const tail = ctrl[ctrl.length - 1]
    const first: number[] = [head[0] + (head[0] - ctrl[1][0]) * 0.4, head[1] + (head[1] - ctrl[1][1]) * 0.4, head[2] + (head[2] - ctrl[1][2]) * 0.4]
    const lastIdx = ctrl.length - 1
    const last: number[] = [
      tail[0] + (tail[0] - ctrl[lastIdx - 1][0]) * 0.4,
      tail[1] + (tail[1] - ctrl[lastIdx - 1][1]) * 0.4,
      tail[2] + (tail[2] - ctrl[lastIdx - 1][2]) * 0.4,
    ]
    const pts = [first, ...ctrl, last]

    const points: [number, number, number][] = []
    const times: number[] = []
    const tangents: [number, number, number][] = []
    const along: number[] = []
    const segCount = pts.length - 1
    for (let seg = 0; seg < segCount; seg++) {
      const p0 = pts[Math.max(0, seg - 1)]
      const p1 = pts[seg]
      const p2 = pts[seg + 1]
      const p3 = pts[Math.min(pts.length - 1, seg + 2)]
      const last = seg === segCount - 1
      const steps = last ? TRAIL_SAMPLES_PER_SEGMENT : TRAIL_SAMPLES_PER_SEGMENT - 1
      for (let i = 0; i <= steps; i++) {
        const t = i / TRAIL_SAMPLES_PER_SEGMENT
        const p = catmullRom(p0, p1, p2, p3, t)
        // 轻微的横向抖动，让星轨是「柔软」的而不是一根硬线
        const n = unit(seed, points.length * 3)
        p[0] += (n - 0.5) * 0.09
        p[1] += (unit(seed, points.length * 3 + 1) - 0.5) * 0.09
        p[2] += (unit(seed, points.length * 3 + 2) - 0.5) * 0.09
        points.push(p)
        // 时间与沿轨位置
        const starPos = seg - 1 + t // ctrl 索引坐标
        const clampedIdx = clamp(starPos, 0, list.length - 1)
        const i0 = Math.floor(clampedIdx)
        const i1 = Math.min(list.length - 1, i0 + 1)
        const f = clampedIdx - i0
        const st0 = i0 <= 0 ? (seg === 0 ? -0.4 : list[0].time) : list[i0].time
        const st1 = i0 >= list.length - 1 ? list[i1].time + 0.4 : list[i1].time
        times.push(st0 + (st1 - st0) * f)
        along.push(0)
      }
    }
    for (let i = 0; i < points.length; i++) {
      const a = points[Math.max(0, i - 1)]
      const b = points[Math.min(points.length - 1, i + 1)]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const dz = b[2] - a[2]
      const len = Math.hypot(dx, dy, dz) || 1
      tangents.push([dx / len, dy / len, dz / len])
    }
    // 时间归一化到 0..1（沿轨道）
    const firstT = times[0]
    const lastT = times[times.length - 1]
    const span = lastT - firstT || 1
    for (let i = 0; i < times.length; i++) times[i] = clamp01((times[i] - firstT) / span)

    const domain = list[0].domain
    out.push({
      id: `trail_${j.id}`,
      journeyId: j.id,
      name: j.name,
      domain,
      points,
      tangents,
      times,
      along,
      width: 0.038 + Math.min(0.028, list.length * 0.002),
      color: domainLinear(domain),
      memberCount: list.length,
      headStarId: list[list.length - 1].id,
      headIndex: list[list.length - 1].index,
      headTime: list[list.length - 1].time,
    })
  }
  return out
}

/* ------------------------------------------------------------------ 星臂 */

const ARM_SAMPLES = 40

/** 每个领域的星臂中心线：没有经历的领域不会长出星臂（那片星域就是暗的） */
function buildArms(stars: StarBody[]): ArmGeometry[] {
  const byDomain = new Map<DomainId, StarBody[]>()
  for (const s of stars) {
    const list = byDomain.get(s.domain)
    if (list) list.push(s)
    else byDomain.set(s.domain, [s])
  }
  const out: ArmGeometry[] = []
  for (const [domain, list] of byDomain) {
    list.sort((a, b) => a.time - b.time)
    const index = DOMAIN_INDEX[domain] ?? 0
    const first = list[0].time
    const last = list[list.length - 1].time
    const span = Math.max(0.05, last - first)
    // 星臂两端各留一点余量，让它不像是被硬切开的
    const tMin = clamp01(first - span * 0.16 - 0.02)
    const tMax = clamp01(last + span * 0.16 + 0.02)
    const samples: [number, number, number][] = []
    for (let i = 0; i <= ARM_SAMPLES; i++) {
      const t = tMin + (tMax - tMin) * (i / ARM_SAMPLES)
      samples.push(starPositionAt(t, index, 0, 0))
    }
    const count = list.length
    out.push({
      domain,
      index,
      color: domainLinear(domain),
      accent: domainAccentLinear(domain),
      count,
      // 经历的多少 → 这条星臂有多亮；空着的领域只有一丝几乎看不见的轮廓
      strength: clamp(0.06 + count * 0.115, 0.06, 1),
      tMin,
      tMax,
      samples,
    })
  }
  out.sort((a, b) => a.index - b.index)
  return out
}

/** 星河的体量随真实记录数量增长：记得越多，星臂越亮、核球越实、盘面越厚 */
function computeDensity(total: number): GalaxyDensity {
  return {
    total,
    gasScale: clamp01(0.36 + total / 42),
    coreScale: clamp01(0.34 + total / 46),
    dustCount: Math.round(clamp(total * 165, 2200, 8400)),
  }
}

/* ------------------------------------------------------------------ 总装 */

export function buildUniverse(archive: Archive, nowMs = Date.now()): LifeUniverse {
  const frame = computeTimeFrame(archive.achievements, nowMs, archive.spanHint)
  const stars = [...archive.achievements]
    .sort((a, b) => (parseWhen(a.happenedAt) ?? 0) - (parseWhen(b.happenedAt) ?? 0))
    .map((a, i) => buildStar(a, i, frame, archive.achievements.length))
  const byId = new Map<string, number>()
  stars.forEach((s, i) => byId.set(s.id, i))
  const constellations = buildConstellations(stars, frame)
  const nebulae = buildNebulae(constellations)
  const trails = buildTrails(stars, archive.journeys)
  const arms = buildArms(stars)
  const density = computeDensity(stars.length)
  const trailsByStar = new Map<string, string[]>()
  for (const t of trails) {
    for (const a of archive.achievements) {
      if (a.journeyId === t.journeyId) {
        const list = trailsByStar.get(a.id)
        if (list) list.push(t.id)
        else trailsByStar.set(a.id, [t.id])
      }
    }
  }

  const byDomain: Record<string, number> = {}
  let firstMs: number | null = null
  let lastMs: number | null = null
  let brightest: string | null = null
  let best = -1
  for (const s of stars) {
    byDomain[s.domain] = (byDomain[s.domain] ?? 0) + 1
    if (firstMs == null || s.ms < firstMs) firstMs = s.ms
    if (lastMs == null || s.ms > lastMs) lastMs = s.ms
    const score = s.achievement.importance * 10 + (s.achievement.resonance ?? 0)
    if (score > best) {
      best = score
      brightest = s.id
    }
  }
  const spanYears = firstMs != null && lastMs != null ? (lastMs - firstMs) / (365.25 * 86400000) : 0

  // 取景几何：以人生星的重心为中心。只有一颗星的时候，
  // 「看向原点」会把它甩到画面边上，而「看向它自己」才是对的。
  let cx = 0
  let cy = 0
  let cz = 0
  for (const s of stars) {
    cx += s.position[0]
    cy += s.position[1]
    cz += s.position[2]
  }
  const n = Math.max(1, stars.length)
  const center: [number, number, number] = stars.length ? [cx / n, cy / n, cz / n] : [0, 0, 0]
  let spread = 0
  for (const s of stars) {
    const d = Math.hypot(s.position[0] - center[0], s.position[1] - center[1], s.position[2] - center[2])
    if (d > spread) spread = d
  }
  const framing = Math.max(spread * 1.12, GALAXY.R1 * 0.86 * Math.min(1, 0.34 + stars.length / 40))

  const stats: LifeStats = {
    total: stars.length,
    byDomain,
    firstMs,
    lastMs,
    spanYears,
    constellationCount: constellations.filter((c) => c.formed).length,
    journeyCount: archive.journeys.length,
    brightest,
  }

  const signature = `${archive.updatedAt}|${stars.length}|${frame.originMs}|${frame.endMs}|${archive.journeys.length}`
  return {
    frame,
    stars,
    byId,
    constellations,
    nebulae,
    trails,
    trailsByStar,
    arms,
    density,
    stats,
    center,
    framing,
    signature,
  }
}

/** 星图整体尺度，用于取景与「拉远」镜头。 */
export function universeExtent(u: LifeUniverse): number {
  return u.framing
}

/** 领域高亮时，该领域对应的分臂序号（-1 表示不高亮） */
export function domainFocusIndexOf(u: LifeUniverse, focus: DomainId | null): number {
  if (!focus) return -1
  const arm = u.arms.find((a) => a.domain === focus)
  if (arm) return arm.index
  const idx = DOMAIN_INDEX[focus]
  return idx == null ? -1 : idx
}

export { CORE_DOMAINS }
