/** 确定性伪随机：同一颗星在任何机器、任何刷新之后都在同一个位置。 */

export function hash32(str: string, salt = 0): number {
  let h = (2166136261 ^ salt) >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 15
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

/** 32 位整数混合 */
export function mix32(a: number, b: number): number {
  let h = (a ^ Math.imul(b ^ (b >>> 16), 2246822507)) >>> 0
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  h ^= h >>> 16
  return h >>> 0
}

/** 由种子 + 序号得到 [0,1) */
export function unit(seed: number, k = 0): number {
  return mix32(seed >>> 0, (k * 2654435761) >>> 0) / 4294967296
}

/** 由种子 + 序号得到 [-1,1) */
export function signed(seed: number, k = 0): number {
  return unit(seed, k) * 2 - 1
}

export function mulberry32(a: number): () => number {
  let t = a >>> 0
  return function rand() {
    t = (t + 0x6d2b79f5) >>> 0
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

/** 近似正态，用于让星云/星尘分布更自然 */export function gaussian(seed: number, k = 0): number {
  const u = Math.max(1e-6, unit(seed, k))
  const v = unit(seed, k + 91)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6))
  return t * t * (3 - 2 * t)
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export function easeInCubic(t: number): number {
  return t * t * t
}

/**
 * 一帧应该推进多少「动画时间」。
 *
 * 直接用帧间隔推进，低端设备才不会把镜头和小星诞生拖成慢动作；
 * 但切走标签页再回来时帧间隔可能是几十秒，那种大跳必须丢弃，
 * 否则镜头会瞬移。所以这里做的是「暂停识别」，而不是把每帧步长一刀切小。
 */
export function frameStep(dt: number, pauseThreshold = 2, maxStep = 1): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0
  if (dt > pauseThreshold) return 0.016
  return Math.min(dt, maxStep)
}

/**
 * 由速度曲线积分得到的缓动。
 * 星履的镜头不是「线性插值 + 一个 ease」，而是先给一个速度包络
 * （缓慢起步 → 巡航 → 减速停住），再对速度积分得到位置曲线，
 * 这样加速、巡航、减速的比例可以被单独控制。
 */
export function velocityProfileEasing(accelFrac: number, decelFrac: number, samples = 192): (t: number) => number {
  const table = new Float32Array(samples + 1)
  const dt = 1 / samples
  let sum = 0
  const speed = (x: number) => {
    const a = accelFrac <= 0 ? 1 : clamp01(x / accelFrac)
    const d = decelFrac <= 0 ? 1 : clamp01((1 - x) / decelFrac)
    const sa = a * a * (3 - 2 * a)
    const sd = d * d * (3 - 2 * d)
    return sa * sd
  }
  for (let i = 0; i <= samples; i++) {
    const x = i * dt
    // 梯形积分
    const w = i === 0 || i === samples ? 0.5 : 1
    sum += w * speed(x) * dt
    table[i] = sum
  }
  const total = sum || 1
  for (let i = 0; i <= samples; i++) table[i] /= total
  return (t: number) => {
    const x = clamp01(t) * samples
    const i = Math.floor(x)
    const f = x - i
    const a = table[Math.min(i, samples)]
    const b = table[Math.min(i + 1, samples)]
    return a + (b - a) * f
  }
}
