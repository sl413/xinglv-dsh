import * as THREE from 'three'
import type { LifeUniverse } from '../../core/layout'
import { clamp } from '../../core/math'

/**
 * 拾取
 * ---------------------------------------------------------------------------
 * 星履不使用射线求交，而是自己做**解析式屏幕投影拾取**：
 *   · 每颗星的拾取半径由它的实际大小（重要程度）在屏幕上的投影决定，
 *     再叠加一个最小可视半径 —— 这就是「合理的隐形拾取范围」：
 *     大星更好点，小星也不至于点不到，而且飞近飞远都成立。
 *   · 观测时刻之后的星不可拾取。未来是未知的，不该被点开。
 *   · 星优先于星座；只有没点到任何星时，才会命中星座的核心区域。
 */

export interface PickResult {
  kind: 'star' | 'constellation'
  id: string
  index: number
  /** 屏幕坐标（CSS 像素） */
  screenX: number
  screenY: number
  /** 归一化命中程度 0..1，越小越准 */
  score: number
  distance: number
  glow: number
}

const tmpVec = new THREE.Vector3()
const tmpView = new THREE.Vector3()

export interface PickOptions {
  obs: number
  /** hover 时略微收紧，避免「隔空高亮」 */
  hover?: boolean
  /** 只拾取星体（按下反馈用） */
  starOnly?: boolean
}

export function pickAt(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  camera: THREE.PerspectiveCamera,
  universe: LifeUniverse,
  options: PickOptions,
): PickResult | null {
  const x = clientX - rect.left
  const y = clientY - rect.top
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null

  const tanHalf = Math.tan((camera.fov * Math.PI) / 360)
  const halfH = rect.height * 0.5
  const stars = universe.stars
  let best: PickResult | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i]
    // 未来不可拾取（与着色器里的可见性保持一致）
    if (s.time > options.obs + 0.012) continue
    tmpVec.set(s.position[0], s.position[1], s.position[2])
    const viewZ = tmpView.copy(tmpVec).applyMatrix4(camera.matrixWorldInverse).z
    if (viewZ > -0.35) continue
    tmpVec.project(camera)
    const sx = (tmpVec.x * 0.5 + 0.5) * rect.width
    const sy = (-tmpVec.y * 0.5 + 0.5) * rect.height
    const dx = sx - x
    const dy = sy - y
    const d = Math.sqrt(dx * dx + dy * dy)
    const pxPerWorld = halfH / (tanHalf * Math.max(0.4, -viewZ))
    const radius = clamp(s.glow * pxPerWorld * (options.hover ? 1.0 : 1.18), options.hover ? 9 : 12, 72)
    if (d > radius) continue
    const score = d / radius
    if (score < bestScore) {
      bestScore = score
      best = {
        kind: 'star',
        id: s.id,
        index: i,
        screenX: sx,
        screenY: sy,
        score,
        distance: -viewZ,
        glow: s.glow,
      }
    }
  }

  if (best || options.starOnly) return best

  // 星座核心区域
  for (const c of universe.constellations) {
    if (!c.formed) continue
    if (c.tMin > options.obs + 0.012) continue
    tmpVec.set(c.centroid[0], c.centroid[1], c.centroid[2])
    const viewZ = tmpView.copy(tmpVec).applyMatrix4(camera.matrixWorldInverse).z
    if (viewZ > -0.5) continue
    tmpVec.project(camera)
    const sx = (tmpVec.x * 0.5 + 0.5) * rect.width
    const sy = (-tmpVec.y * 0.5 + 0.5) * rect.height
    const d = Math.hypot(sx - x, sy - y)
    const pxPerWorld = halfH / (tanHalf * Math.max(0.4, -viewZ))
    const radius = clamp(c.radius * pxPerWorld * 0.52, 20, 96)
    if (d > radius) continue
    const score = d / radius + 0.35 // 让星永远优先
    if (score < bestScore) {
      bestScore = score
      best = {
        kind: 'constellation',
        id: c.id,
        index: -1,
        screenX: sx,
        screenY: sy,
        score,
        distance: -viewZ,
        glow: c.radius,
      }
    }
  }

  return best
}
