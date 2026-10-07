import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { clamp01, mulberry32 } from '../../core/math'
import { runtime } from '../runtime'
import { useLife } from '../../state/store'
import { buildRibbon, createRibbonMaterial, samplePath } from '../geometry/ribbon'

/**
 * 新星诞生仪式
 * ---------------------------------------------------------------------------
 * 这不是奖励动画。它是「一个人认真对待自己」的那几秒钟：
 *
 *   0.0s  环境轻微变暗 —— 其他星辰让出一点光
 *   0.35s 微光出现 —— 一切从一个几乎看不见的点开始
 *   1.0s  星尘受引力影响，一边缓慢旋转一边向这个点汇聚
 *   2.3s  核心收缩，同时增强 —— 越收越亮
 *   3.4s  柔和的光向四周扩散（不是爆炸：没有冲击环、没有碎片、没有音效）
 *   3.9s  新星稳定形成，光晕缓缓出现
 *   4.2s  相关的旧星向它缓慢生长出星轨
 *   6.6s  镜头拉远 —— 让人看见它已经成为自己人生星河的一部分
 *
 * 全流程禁止抽卡、爆炸、金币、升级、数值飞出等任何游戏化表达。
 */

const T = {
  seedStart: 0.3,
  convergeStart: 0.9,
  convergeEnd: 2.9,
  contractStart: 2.3,
  flashAt: 3.42,
  birthStart: 3.8,
  birthEnd: 5.2,
  trailStart: 4.2,
  trailEnd: 7.4,
  pullStart: 6.6,
  total: 9.4,
}

function chase(t: number, a: number, b: number): number {
  if (b <= a) return t >= b ? 1 : 0
  return clamp01((t - a) / (b - a))
}
function es(x: number): number {
  return x * x * (3 - 2 * x)
}
/** 关键帧插值：整段编舞只有这一种曲线，保证节奏统一、可读 */
function key(t: number, frames: Array<[number, number]>): number {
  if (t <= frames[0][0]) return frames[0][1]
  for (let i = 0; i < frames.length - 1; i++) {
    const [t0, v0] = frames[i]
    const [t1, v1] = frames[i + 1]
    if (t <= t1) return v0 + (v1 - v0) * es(chase(t, t0, t1))
  }
  return frames[frames.length - 1][1]
}

export function NovaCeremony({ starId }: { starId: string }) {
  const universe = useLife((s) => s.universe)
  const tRef = useRef(0)
  const doneRef = useRef(false)
  const pulledRef = useRef(false)

  const info = useMemo(() => {
    const idx = universe.byId.get(starId)
    if (idx == null) return null
    const star = universe.stars[idx]
    // 相关旧星：同领域、时间更早、最近的几颗 —— 它们的光会先长过来
    const related = universe.stars
      .filter((s) => s.domain === star.domain && s.ms < star.ms && s.id !== star.id)
      .sort((a, b) => b.ms - a.ms)
      .slice(0, 3)
    return { idx, star, related }
  }, [universe, starId])

  const partnerTrails = useMemo(() => {
    if (!info) return []
    return universe.trails.filter((t) => t.journeyId === info.star.achievement.journeyId)
  }, [universe.trails, info])

  /* --------------------------------------------------- 诞生相关的三件视觉 */

  const mats = useMemo(() => {
    const seed = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uObs: { value: 1 },
        uDim: { value: 1 },
        uBoot: { value: 1 },
        uWhoosh: { value: 0 },
        uPixelRatio: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uSize: { value: 0.3 },
        uBright: { value: 0 },
        uCore: { value: 1.5 },
        uColor: { value: new THREE.Vector3(0.8, 0.86, 0.95) },
      },
      vertexShader: /* glsl */ `
        uniform vec3 uCenter;
        uniform float uSize;
        varying vec2 vQ;
        void main() {
          vec4 mv = modelViewMatrix * vec4(uCenter, 1.0);
          mv.xy += position.xy * uSize;
          gl_Position = projectionMatrix * mv;
          vQ = position.xy;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uBright;
        uniform float uCore;
        uniform vec3 uColor;
        varying vec2 vQ;
        void main() {
          if (uBright < 0.001) discard;
          float r = length(vQ);
          if (r > 1.0) discard;
          float core = exp(-r * r * (150.0 / max(0.3, uCore))) * 2.6;
          float inner = exp(-r * r * 9.0) * 0.7;
          float halo = pow(max(0.0, 1.0 - r), 4.0) * 0.35;
          vec3 hot = mix(uColor, vec3(1.0), 0.8);
          gl_FragColor = vec4((hot * core + uColor * (inner + halo)) * uBright, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    const shock = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uObs: { value: 1 },
        uDim: { value: 1 },
        uBoot: { value: 1 },
        uWhoosh: { value: 0 },
        uPixelRatio: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uSize: { value: 7.5 },
        uP: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Vector3(0.8, 0.86, 0.95) },
      },
      vertexShader: /* glsl */ `
        uniform vec3 uCenter;
        uniform float uSize;
        varying vec2 vQ;
        void main() {
          vec4 mv = modelViewMatrix * vec4(uCenter, 1.0);
          mv.xy += position.xy * uSize;
          gl_Position = projectionMatrix * mv;
          vQ = position.xy;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uP;
        uniform float uOpacity;
        uniform vec3 uColor;
        varying vec2 vQ;
        void main() {
          if (uOpacity < 0.002) discard;
          float r = length(vQ);
          // 柔和的光扩散：一个很宽的、边缘迅速衰减的壳，而不是冲击环
          float radius = mix(0.045, 0.96, uP);
          float width = mix(0.06, 0.30, uP);
          float shell = exp(-pow((r - radius) / width, 2.0));
          float glow = exp(-r * r * 3.2) * (1.0 - uP) * 0.55;
          float a = (shell * (1.0 - uP * 0.72) + glow) * uOpacity;
          vec3 col = mix(uColor, vec3(1.0), 0.45 - uP * 0.3);
          gl_FragColor = vec4(col * a * 1.15, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })

    return { seed, shock }
  }, [])

  const seedGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), [])
  const shockGeo = useMemo(() => new THREE.PlaneGeometry(2, 2), [])

  const inflow = useMemo(() => {
    const count = 900
    const rand = mulberry32(0x4a17)
    const dir = new Float32Array(count * 3)
    const param = new Float32Array(count * 3) // radius0, speed, phase
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const s = Math.sqrt(Math.max(0, 1 - u * u))
      // 稍微压扁一点，让它像星盘里的物质而不是一个球壳
      dir[i * 3] = s * Math.cos(a)
      dir[i * 3 + 1] = u * 0.55
      dir[i * 3 + 2] = s * Math.sin(a)
      param[i * 3] = 2.4 + Math.pow(rand(), 0.6) * 7.5
      param[i * 3 + 1] = 0.5 + rand() * 1.6
      param[i * 3 + 2] = rand() * Math.PI * 2
      size[i] = 0.7 + rand() * 2.1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(dir, 3))
    g.setAttribute('aParam', new THREE.BufferAttribute(param, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60)
    const m = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uObs: { value: 1 },
        uDim: { value: 1 },
        uBoot: { value: 1 },
        uWhoosh: { value: 0 },
        uPixelRatio: { value: 1 },
        uCenter: { value: new THREE.Vector3() },
        uP: { value: 0 },
        uOpacity: { value: 0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 aParam;
        attribute float aSize;
        uniform vec3 uCenter;
        uniform float uP;
        uniform float uPixelRatio;
        uniform float uOpacity;
        varying float vA;
        void main() {
          float ease = uP * uP * (3.0 - 2.0 * uP);
          vec3 dir = normalize(position);
          float r = mix(aParam.x, 0.06, ease);
          float ang = aParam.z + uP * (2.6 + aParam.y * 2.4);
          vec3 rel = dir * r;
          float ca = cos(ang * 0.42);
          float sa = sin(ang * 0.42);
          rel = vec3(rel.x * ca - rel.z * sa, rel.y * (1.0 - 0.45 * ease), rel.x * sa + rel.z * ca);
          vec3 world = uCenter + rel;
          vec4 mv = modelViewMatrix * vec4(world, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = clamp(aSize * 2.0 * clamp(60.0 / max(1.5, -mv.z), 0.2, 3.0) * uPixelRatio, 0.6, 8.0);
          vA = uOpacity * (1.0 - smoothstep(0.78, 1.0, uP)) * (0.35 + 0.65 * (1.0 - ease));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = exp(-d * d * 3.6) * (1.0 - smoothstep(0.7, 1.0, d));
          gl_FragColor = vec4(vec3(0.82, 0.87, 0.96) * a * vA, 1.0);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    })
    return { geometry: g, material: m }
  }, [])

  const links = useMemo(() => {
    if (!info) return []
    const target: [number, number, number] = [info.star.position[0], info.star.position[1], info.star.position[2]]
    return info.related.map((s, i) => {
      const from: [number, number, number] = [s.position[0], s.position[1], s.position[2]]
      const mid: [number, number, number] = [
        (from[0] + target[0]) / 2 + (i - 1) * 0.25,
        (from[1] + target[1]) / 2 + 0.42 + i * 0.08,
        (from[2] + target[2]) / 2 + (i - 1) * 0.2,
      ]
      const path = samplePath([from, mid, target], 16, [s.time, (s.time + info.star.time) / 2, info.star.time])
      return {
        id: `novalink_${i}`,
        geometry: buildRibbon(path),
        material: createRibbonMaterial({ color: info.star.color, width: 0.17, grow: 0, strength: 0.4, opacity: 0 }),
      }
    })
  }, [info])

  /* ------------------------------------------------------- 注册与清理 */

  useLayoutEffect(() => {
    if (!info) return
    runtime.ceremony = {
      starId,
      index: info.idx,
      position: new THREE.Vector3(info.star.position[0], info.star.position[1], info.star.position[2]),
      t: 0,
      trailIds: partnerTrails.map((t) => t.id),
    }
    runtime.set('lifeStars', 'uNovaIndex', info.idx)
    runtime.set('lifeStars', 'uNovaBirth', 0.001)
    runtime.set('lifeStars', 'uNovaCore', 1)
    runtime.set('lifeStars', 'uNovaBright', 1)
    runtime.set('lifeStars', 'uNovaHalo', 0)
    const pos = new THREE.Vector3(info.star.position[0], info.star.position[1], info.star.position[2])
    mats.seed.uniforms.uCenter.value.copy(pos)
    mats.seed.uniforms.uColor.value.set(info.star.color[0], info.star.color[1], info.star.color[2])
    mats.shock.uniforms.uCenter.value.copy(pos)
    mats.shock.uniforms.uColor.value.set(info.star.color[0], info.star.color[1], info.star.color[2])
    inflow.material.uniforms.uCenter.value.copy(pos)
    runtime.set('starDust', 'uConvergeTarget', pos)
    runtime.set('starDust', 'uConvergeRadius', 7.5)
    for (const t of partnerTrails) runtime.set(t.id, 'uGrow', 0)
    for (const l of links) runtime.set(l.id, 'uGrow', 0)
    tRef.current = 0
    doneRef.current = false
    pulledRef.current = false
    return () => {
      runtime.ceremony = null
      runtime.dim = 1
      runtime.bloom = 1
      runtime.broadcast('uDim', 1)
      runtime.set('lifeStars', 'uNovaIndex', -1)
      runtime.set('lifeStars', 'uNovaBirth', 1)
      runtime.set('lifeStars', 'uNovaBright', 1)
      runtime.set('lifeStars', 'uNovaCore', 1)
      runtime.set('lifeStars', 'uNovaHalo', 0)
      runtime.set('starDust', 'uConverge', 0)
      for (const t of partnerTrails) runtime.set(t.id, 'uGrow', 1)
      for (const l of links) runtime.set(l.id, 'uGrow', 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info, starId, mats, inflow, partnerTrails, links])

  useEffect(() => {
    for (const l of links) runtime.register(l.id, l.material)
    return () => {
      for (const l of links) runtime.unregister(l.id)
    }
  }, [links])

  useEffect(
    () => () => {
      seedGeo.dispose()
      shockGeo.dispose()
      mats.seed.dispose()
      mats.shock.dispose()
      inflow.geometry.dispose()
      inflow.material.dispose()
      for (const l of links) {
        l.geometry.dispose()
        l.material.dispose()
      }
    },
    [seedGeo, shockGeo, mats, inflow, links],
  )

  /* ------------------------------------------------------------- 编舞 */

  useFrame(() => {
    const store = useLife.getState()
    const t = (tRef.current += runtime.dt)
    runtime.ceremony && (runtime.ceremony.t = t)

    const env = es(chase(t, 0, 0.9)) * (1 - es(chase(t, 5.6, 7.8)))
    const dim = 1 - 0.42 * env
    runtime.dim = dim
    runtime.broadcast('uDim', dim)

    const flash = Math.exp(-Math.pow((t - T.flashAt) / 0.17, 2))
    runtime.bloom = 1 + 0.3 * es(chase(t, 2.2, 3.3)) + 1.55 * flash

    // 新星本体
    const birth = key(t, [
      [0, 0.001],
      [T.birthStart, 0.002],
      [T.birthEnd, 1],
    ])
    runtime.set('lifeStars', 'uNovaBirth', birth)
    runtime.set(
      'lifeStars',
      'uNovaBright',
      key(t, [
        [0, 1],
        [T.birthStart, 1.05],
        [T.flashAt, 2.9],
        [4.35, 2.1],
        [T.birthEnd, 1],
      ]),
    )
    runtime.set(
      'lifeStars',
      'uNovaCore',
      key(t, [
        [0, 1],
        [T.birthStart, 0.9],
        [3.98, 0.7],
        [4.8, 1],
      ]),
    )
    runtime.set(
      'lifeStars',
      'uNovaHalo',
      key(t, [
        [0, 0],
        [4.3, 0],
        [5.7, 1.5],
      ]),
    )

    // 微光 / 收缩 / 闪光 / 交接
    mats.seed.uniforms.uBright.value = key(t, [
      [0, 0],
      [T.seedStart, 0],
      [1.05, 0.5],
      [T.contractStart, 0.72],
      [3.3, 1.5],
      [T.flashAt, 4.4],
      [3.95, 1.1],
      [4.6, 0.2],
      [5.1, 0],
    ])
    mats.seed.uniforms.uSize.value = key(t, [
      [0, 0.32],
      [3.3, 0.52],
      [T.flashAt, 1.35],
      [4.2, 1.85],
      [5.1, 2.2],
    ])
    mats.seed.uniforms.uCore.value = key(t, [
      [0, 1.6],
      [T.contractStart, 1.6],
      [3.34, 0.62],
      [3.7, 1.15],
      [4.6, 1],
    ])

    // 柔和光扩散
    const shockP = chase(t, 3.28, 5.0)
    mats.shock.uniforms.uP.value = shockP
    mats.shock.uniforms.uOpacity.value = key(t, [
      [0, 0],
      [3.28, 0],
      [3.55, 1],
      [4.3, 0.5],
      [5.1, 0],
    ])

    // 星尘汇聚
    const inflowP = chase(t, 1.25, 3.5)
    inflow.material.uniforms.uP.value = inflowP
    inflow.material.uniforms.uOpacity.value = key(t, [
      [0, 0],
      [1.1, 0],
      [1.8, 1],
      [3.1, 1],
      [3.75, 0],
    ])
    runtime.set(
      'starDust',
      'uConverge',
      key(t, [
        [0, 0],
        [T.convergeStart, 0],
        [T.convergeEnd, 1],
        [3.5, 1],
        [4.4, 0],
      ]),
    )

    // 星轨生长
    const grow = key(t, [
      [0, 0],
      [T.trailStart, 0],
      [T.trailEnd, 1],
    ])
    for (const trail of partnerTrails) runtime.set(trail.id, 'uGrow', grow)
    const linkGrow = key(t, [
      [0, 0],
      [4.5, 0],
      [7.8, 1],
    ])
    for (const l of links) {
      runtime.set(l.id, 'uGrow', linkGrow)
      l.material.uniforms.uOpacity.value = key(t, [
        [0, 0],
        [4.5, 0],
        [5.3, 0.85],
        [8.2, 0.5],
        [9.4, 0],
      ])
    }

    // 镜头拉远
    if (!pulledRef.current && t >= T.pullStart) {
      pulledRef.current = true
      store.overviewCamera()
    }

    if (!doneRef.current && t >= T.total) {
      doneRef.current = true
      store.finishCeremony()
    }
  })

  if (!info) return null

  return (
    <group>
      <mesh renderOrder={40} geometry={shockGeo} material={mats.shock} frustumCulled={false} />
      <mesh renderOrder={42} geometry={seedGeo} material={mats.seed} frustumCulled={false} />
      <points renderOrder={41} geometry={inflow.geometry} material={inflow.material} frustumCulled={false} />
      {links.map((l) => (
        <mesh key={l.id} renderOrder={14} geometry={l.geometry} material={l.material} frustumCulled={false} />
      ))}
    </group>
  )
}
