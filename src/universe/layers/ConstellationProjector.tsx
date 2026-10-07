import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { clamp01, smoothstep } from '../../core/math'
import { runtime } from '../runtime'
import { useLife } from '../../state/store'

/**
 * 人生星座的存在感
 * ---------------------------------------------------------------------------
 * 星座是真实存在的结构（同一领域、时间相近的一批经历），但如果不标出来，
 * 用户只会看到一片散星。这里把每个成形星座的重心投影到屏幕，
 * 交给 DOM 层画一行很轻的标注 —— DOM 只负责文字，位置每帧由这里算。
 *
 * 之所以不放进 React state：一帧一次 setState 会把整个界面拖垮。
 */

const tmp = new THREE.Vector3()
const tmpView = new THREE.Vector3()

export function ConstellationProjector() {
  const universe = useLife((s) => s.universe)
  const frameRef = useRef(0)

  useFrame(({ camera, size }) => {
    frameRef.current++
    // 每 4 帧更新一次足够跟手（标注不像星体需要逐帧精确）
    if (frameRef.current % 4 !== 0) return

    const out: typeof runtime.projected = []
    const placed: Array<{ x: number; y: number }> = []
    // 大的星座优先占位：星座一多，标注会叠成一团
    const ordered = [...universe.constellations].filter((c) => c.formed).sort((a, b) => b.memberIds.length - a.memberIds.length)
    for (const c of ordered) {
      if (placed.length >= 6) break
      // 未来还没发生的星座不该出现
      if (c.tMin > runtime.obs + 0.03) continue
      tmp.set(c.centroid[0], c.centroid[1], c.centroid[2])
      const viewZ = tmpView.copy(tmp).applyMatrix4(camera.matrixWorldInverse).z
      if (viewZ > -1) continue
      const dist = -viewZ
      tmp.project(camera)
      const x = (tmp.x * 0.5 + 0.5) * size.width
      const y = (-tmp.y * 0.5 + 0.5) * size.height
      if (x < 50 || y < 56 || x > size.width - 50 || y > size.height - 70) continue
      // 贴太近或退太远都淡出：标注只在中远景里有意义
      const alpha = smoothstep(7, 12, dist) * (1 - smoothstep(72, 120, dist)) * clamp01((c.memberIds.length - 2) / 2 + 0.35)
      if (alpha < 0.04) continue
      // 避让：和已经放下的标注太近就不放，宁少不乱
      let clash = false
      for (const p of placed) {
        if (Math.abs(p.x - x) < 170 && Math.abs(p.y - y) < 42) {
          clash = true
          break
        }
      }
      if (clash) continue
      placed.push({ x, y })
      out.push({ id: c.id, x, y, alpha })
    }
    runtime.projected = out
  })

  return null
}
