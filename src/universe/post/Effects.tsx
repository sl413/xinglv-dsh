import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import { useFrame } from '@react-three/fiber'
import { Bloom, DepthOfField, EffectComposer, Noise, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type BloomEffect, type DepthOfFieldEffect } from 'postprocessing'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 后处理链
 * ---------------------------------------------------------------------------
 * 顺序刻意如此：泛光 → 景深 → 暗角 → 噪点 → 色调映射。
 *
 *   · 泛光在色调映射之前，才有真正的 HDR 光晕（星核可以超过 1.0 并被揉开）。
 *   · 景深用来自绘制的深度预写层，焦平面跟着 Camera Director 走：
 *     自由漫游时几乎不虚化，聚焦一颗星时背景的星云会真的软下去。
 *   · 噪点极低（0.014）：它存在只是为了压掉深空渐变里的色带，不该被看见。
 *   · ACES 色调映射负责把高光滚落，保持「80% 黑暗、20% 光」。
 */

export function Effects() {
  const quality = useLife((s) => s.quality)
  const profile = QUALITY[quality]
  const dofRef = useRef<DepthOfFieldEffect>(null)
  const bloomRef = useRef<BloomEffect>(null)

  useFrame(() => {
    const d = dofRef.current
    if (d) {
      const coc = d.cocMaterial
      if (coc) {
        const focus = Math.max(1.2, runtime.focusDistance)
        coc.focusDistance = focus
        // 焦平面附近足够厚，深空才不会被整片糊掉 —— 「适度」景深
        coc.focusRange = Math.max(8, focus * 0.6)
      }
      d.bokehScale = Math.max(0, runtime.bokeh)
    }
    const b = bloomRef.current
    if (b) b.intensity = profile.bloomIntensity * runtime.bloom
  })

  const children: ReactElement[] = [
    <Bloom
      key="bloom"
      ref={bloomRef}
      mipmapBlur
      intensity={profile.bloomIntensity}
      luminanceThreshold={0.115}
      luminanceSmoothing={0.42}
      levels={profile.bloomLevels}
      radius={0.86}
    />,
  ]
  if (profile.depthOfField) {
    children.push(
      <DepthOfField key="dof" ref={dofRef} focusDistance={24} focusRange={9} bokehScale={0} resolutionScale={0.5} />,
    )
  }
  children.push(<Vignette key="vignette" offset={0.26} darkness={0.62} />)
  children.push(<Noise key="noise" premultiply blendFunction={BlendFunction.SCREEN} opacity={0.014} />)
  children.push(<ToneMapping key="tonemap" mode={ToneMappingMode.ACES_FILMIC} />)

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {children}
    </EffectComposer>
  )
}

/** 便于外部（调试/测试）确认后处理链已挂载 */
export function useEffectsReady(): boolean {
  const ready = useRef(false)
  useEffect(() => {
    ready.current = true
  }, [])
  return ready.current
}
