import { useRef } from 'react'
import * as THREE from 'three'
import { Canvas } from '@react-three/fiber'
import { PerformanceMonitor } from '@react-three/drei'
import { QUALITY } from './quality'
import { RuntimeBridge } from './RuntimeBridge'
import { CameraRig } from './camera/CameraRig'
import { DeepField } from './layers/DeepField'
import { NebulaField } from './layers/NebulaField'
import { MidDust } from './layers/MidDust'
import { LifeStars } from './layers/LifeStars'
import { StarDust } from './layers/StarDust'
import { StarCore } from './layers/StarCore'
import { StarTrails } from './layers/StarTrails'
import { NearMotes } from './layers/NearMotes'
import { ConstellationProjector } from './layers/ConstellationProjector'
import { GalaxyBody } from './layers/GalaxyBody'
import { NovaCeremony } from './ceremony/NovaCeremony'
import { Effects } from './post/Effects'
import { useLife, type QualityLevel } from '../state/store'

/**
 * 星履 · 实时 3D 宇宙
 * ---------------------------------------------------------------------------
 * 四个空间层级同时存在，各自以不同速度与视差运动：
 *   1. DeepField   极远恒星 + 银河（球壳 + 26 个星团）
 *   2. NebulaField 中距离星云（FBM 域扭曲的 billboard 簇）与 MidDust 宇宙尘埃
 *   3. LifeStars   人生星（instanced shader）、StarDust 环绕星尘、StarTrails 星轨
 *   4. NearMotes   永远包着相机的近景微粒
 *
 * 组件的先后顺序 = useFrame 的执行顺序，所以 RuntimeBridge 写在最前面，
 * CameraRig 紧随其后，读取相机的图层排在后面。这不是风格问题，
 * 是让一帧里的 uniform 在同一帧生效的必要条件。
 */

const ORDER: QualityLevel[] = ['low', 'balanced', 'high']

export function Universe() {
  const quality = useLife((s) => s.quality)
  const setQuality = useLife((s) => s.setQuality)
  const ceremony = useLife((s) => s.ceremony)
  const profile = QUALITY[quality]
  const autoRef = useRef(false)

  return (
    <Canvas
      className="xinglv-canvas"
      dpr={[1, profile.dprCap]}
      frameloop="always"
      gl={{
        antialias: false,
        alpha: false,
        stencil: false,
        depth: true,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      }}
      camera={{ fov: 52, near: 0.35, far: 2100, position: [13, 9.5, 15] }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.NoToneMapping // 由后处理链里的 ToneMapping 统一负责
        gl.setClearColor(new THREE.Color(0x03040a), 1)
        scene.background = null
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        onDecline={() => {
          const s = useLife.getState()
          if (s.qualityLocked) return
          const idx = ORDER.indexOf(s.quality)
          if (idx > 0) {
            autoRef.current = true
            setQuality(ORDER[idx - 1], false)
          }
        }}
        onIncline={() => {
          const s = useLife.getState()
          if (!autoRef.current || s.qualityLocked) return
          const idx = ORDER.indexOf(s.quality)
          if (idx < ORDER.length - 1) setQuality(ORDER[idx + 1], false)
        }}
      />
      <RuntimeBridge />
      <CameraRig />
      <DeepField />
      <MidDust />
      <NebulaField />
      <GalaxyBody />
      <StarTrails />
      <LifeStars />
      <StarDust />
      <StarCore />
      <NearMotes />
      <ConstellationProjector />
      {ceremony ? <NovaCeremony key={ceremony.token} starId={ceremony.starId} /> : null}
      <Effects />
    </Canvas>
  )
}
