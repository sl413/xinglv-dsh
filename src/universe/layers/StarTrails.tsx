import { useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import type { TrailSpec } from '../../core/layout'
import { buildRibbon, createRibbonMaterial } from '../geometry/ribbon'
import { runtime } from '../runtime'
import { useLife } from '../../state/store'

/**
 * 星轨
 * ---------------------------------------------------------------------------
 * 同一段成长路径上的经历，被一条柔软的星轨连起来。
 *
 * 用自定义 ribbon 而不是现成的 Line，是为了三件现成组件做不到的事：
 *   · 每条星轨可以沿轨道「生长」（新星诞生时，旧星向新星慢慢长出光轨）
 *   · 可以按人生时间逐段消散（时间回溯时，未来的那一段自己化开）
 *   · 宽度按距离补偿，飞近飞远都保持同样的细腻
 */

interface TrailObject {
  id: string
  geometry: THREE.BufferGeometry
  material: THREE.ShaderMaterial
}

export function StarTrails() {
  const trails = useLife((s) => s.universe.trails)
  const visible = useLife((s) => s.trailsVisible)

  const objects = useMemo<TrailObject[]>(() => {
    const state = useLife.getState()
    const ceremonyStarId = state.ceremony?.starId
    const novaJourneyId = ceremonyStarId ? journeyOfStar(state.universe, ceremonyStarId) : undefined
    return trails.map((t) => {
      const containsNova = !!novaJourneyId && t.journeyId === novaJourneyId
      return {
        id: t.id,
        geometry: buildRibbon({ points: t.points, tangents: t.tangents, times: t.times }),
        material: createRibbonMaterial({
          color: t.color,
          width: trailWidth(t),
          grow: containsNova ? 0 : 1,
          // 星轨是「联系」的暗示，不是画在星空上的线：
          // 强度压得很低，并且一段旅程里的经历越多，单条越淡。
          strength: 0.15 * Math.min(1, Math.max(0.26, 9 / Math.max(1, t.memberCount))),
        }),
      }
    })
  }, [trails])

  useEffect(() => {
    for (const o of objects) runtime.register(o.id, o.material)
    return () => {
      for (const o of objects) runtime.unregister(o.id)
    }
  }, [objects])

  /** 星轨开关：关掉之后星空里一根线都不剩 */
  useEffect(() => {
    for (const o of objects) o.material.uniforms.uOpacity.value = visible ? 1 : 0
  }, [objects, visible])

  useEffect(
    () => () => {
      for (const o of objects) {
        o.geometry.dispose()
        o.material.dispose()
      }
    },
    [objects],
  )

  if (objects.length === 0) return null

  return (
    <group>
      {objects.map((o) => (
        <mesh key={o.id} renderOrder={12} geometry={o.geometry} material={o.material} frustumCulled={false} />
      ))}
    </group>
  )
}

function trailWidth(t: TrailSpec): number {
  return t.width * 1.15
}

function journeyOfStar(universe: ReturnType<typeof useLife.getState>['universe'], starId: string): string | undefined {
  const idx = universe.byId.get(starId)
  if (idx == null) return undefined
  return universe.stars[idx].achievement.journeyId
}
