import type { QualityLevel } from '../state/store'

export interface QualityProfile {
  farStars: number
  midDust: number
  motes: number
  /** 每颗人生星周围的环绕星尘数量 */
  starDustPerStar: number
  /** 星云每片 puff 数倍率 */
  nebulaScale: number
  /** 0~1：细节密度开关。盘面着色器用它决定要不要算第二级域扭曲（uniform 分支，低档真的跳过） */
  detail: number
  bloomLevels: number
  bloomIntensity: number
  depthOfField: boolean
  msaa: number
  dprCap: number
}

export const QUALITY: Record<QualityLevel, QualityProfile> = {
  high: {
    farStars: 19000,
    midDust: 3200,
    motes: 260,
    starDustPerStar: 16,
    nebulaScale: 1,
    detail: 1,
    bloomLevels: 8,
    bloomIntensity: 1.05,
    depthOfField: true,
    msaa: 4,
    dprCap: 2,
  },
  balanced: {
    farStars: 10500,
    midDust: 1900,
    motes: 180,
    starDustPerStar: 10,
    nebulaScale: 0.8,
    detail: 0.55,
    bloomLevels: 6,
    bloomIntensity: 0.95,
    depthOfField: false,
    msaa: 0,
    dprCap: 1.6,
  },
  low: {
    farStars: 5600,
    midDust: 950,
    motes: 120,
    starDustPerStar: 6,
    nebulaScale: 0.6,
    detail: 0,
    bloomLevels: 5,
    bloomIntensity: 0.85,
    depthOfField: false,
    msaa: 0,
    dprCap: 1.15,
  },
}

export function detectQuality(): QualityLevel {
  if (typeof navigator === 'undefined') return 'balanced'
  const ua = navigator.userAgent
  const mobile = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(ua)
  const cores = navigator.hardwareConcurrency ?? 4
  const smallScreen = typeof window !== 'undefined' && Math.min(window.innerWidth, window.innerHeight) < 620
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (mobile && smallScreen) return 'balanced'
  if (cores <= 3) return 'balanced'
  if (coarse && smallScreen) return 'balanced'
  return 'high'
}
