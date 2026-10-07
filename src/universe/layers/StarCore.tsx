import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { frameStep } from '../../core/math'
import { NOISE_GLSL } from '../shaders/common'
import { runtime } from '../runtime'
import { useLife } from '../../state/store'

/**
 * 近景能量细节 —— 「近看是一段人生」
 * ---------------------------------------------------------------------------
 * 当相机足够靠近某一颗人生星时，远景的 billboard 会让位给这一层：
 * 星核、被极角拉伸的丝状光、缓慢流动的内层湍流、边缘弧光与一圈记忆般的环。
 * 只在近距离显示，所以永远只有一颗，成本可控。
 */

const NEAR_ENTER = 8.5
const NEAR_FULL = 3.2

export function StarCore() {
  const universe = useLife((s) => s.universe)
  const frameRef = useRef(0)

  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2)
    return g
  }, [])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uObs: { value: 1 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uPixelRatio: { value: 1 },
          uCenter: { value: new THREE.Vector3(0, 0, 0) },
          uScale: { value: 1 },
          uColor: { value: new THREE.Vector3(0.7, 0.8, 0.9) },
          uSeed: { value: 0 },
          uOpacity: { value: 0 },
          uBright: { value: 1 },
        },
        vertexShader: /* glsl */ `
          uniform vec3 uCenter;
          uniform float uScale;
          varying vec2 vQ;
          void main() {
            vec4 mv = modelViewMatrix * vec4(uCenter, 1.0);
            mv.xy += position.xy * uScale;
            gl_Position = projectionMatrix * mv;
            vQ = position.xy;
          }
        `,
        fragmentShader: /* glsl */ `
          ${NOISE_GLSL}
          uniform float uTime;
          uniform float uOpacity;
          uniform float uSeed;
          uniform float uBright;
          uniform vec3 uColor;
          varying vec2 vQ;

          void main() {
            if (uOpacity < 0.004) discard;
            float r = length(vQ);
            if (r > 1.0) discard;
            float ang = atan(vQ.y, vQ.x);
            float shell = smoothstep(1.0, 0.0, r);
            float inShell = smoothstep(1.0, 0.55, r);

            // 极角方向拉伸的丝状光：这是「近看有结构」的来源
            float fil = fbm2(vec2(ang * 2.7 + uSeed * 9.0, r * 6.5 - uTime * 0.14));
            float fil2 = fbm2(vec2(ang * 5.3 - uSeed * 4.0, r * 12.0 + uTime * 0.09));
            float turb = fil * 0.62 + fil2 * 0.38;

            float core = exp(-r * r * 52.0) * 3.1;
            float innerGlow = exp(-r * r * 7.0) * 0.62;

            // 记忆般的环：几道极淡的同心结构，随噪声轻微摆动
            float rings = 0.0;
            for (int i = 0; i < 3; i++) {
              float fi = float(i);
              float rad = 0.34 + fi * 0.2 + turb * 0.05;
              rings += exp(-pow((r - rad) * (11.0 + fi * 4.0), 2.0)) * (0.1 - fi * 0.026);
            }

            // 外缘必须是「渐渐消失」，不能有任何硬边 —— 否则近看会变成一个球
            float outer = pow(max(0.0, 1.0 - r), 3.0) * (0.5 + 0.5 * turb);
            vec3 hot = mix(uColor, vec3(1.0), 0.6);
            vec3 col = hot * core + uColor * (innerGlow + inShell * turb * 0.72 + shell * 0.05);
            col += uColor * rings;
            col += uColor * outer * 0.2;
            col *= 0.9 + 0.1 * sin(uTime * 0.9 + uSeed * 12.0);

            gl_FragColor = vec4(col * uOpacity * uBright, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    runtime.register('starCore', material)
    return () => runtime.unregister('starCore')
  }, [material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state, dt) => {
    const mat = material
    // 用真实帧间隔做时间常数：原来的「每帧 ×0.1」在低帧率下会变成一顿一顿的跳变，
    // 那正是「镜头刚停、细节突然冒出来」的来源。这里改成与帧率无关的指数逼近。
    const step = frameStep(dt, 2, 1)
    const kIn = 1 - Math.exp(-step / 0.34)
    const kOut = 1 - Math.exp(-step / 0.5)
    frameRef.current++
    const stars = universe.stars
    if (stars.length === 0) {
      mat.uniforms.uOpacity.value = 0
      return
    }
    const camPos = state.camera.position

    // 选中的优先；否则每 6 帧找一次离相机最近、且当前真实可见的星
    let idx = runtime.selectedIndex
    const needSearch = idx < 0 || idx >= stars.length || frameRef.current % 6 === 0
    if (needSearch) {
      let best = -1
      let bestD = NEAR_ENTER
      const futureLimit = runtime.obs
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i]
        if (s.time > futureLimit + 0.05) continue
        const d = Math.hypot(s.position[0] - camPos.x, s.position[1] - camPos.y, s.position[2] - camPos.z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      if (runtime.selectedIndex >= 0 && runtime.selectedIndex < stars.length) {
        const s = stars[runtime.selectedIndex]
        const d = Math.hypot(s.position[0] - camPos.x, s.position[1] - camPos.y, s.position[2] - camPos.z)
        if (d < NEAR_ENTER) idx = runtime.selectedIndex
        else idx = best
      } else {
        idx = best
      }
    }

    if (idx < 0) {
      mat.uniforms.uOpacity.value += (0 - mat.uniforms.uOpacity.value) * kOut
      return
    }
    const s = stars[idx]
    const dist = Math.hypot(s.position[0] - camPos.x, s.position[1] - camPos.y, s.position[2] - camPos.z)
    const target = dist >= NEAR_ENTER ? 0 : dist <= NEAR_FULL ? 1 : 1 - (dist - NEAR_FULL) / (NEAR_ENTER - NEAR_FULL)
    const cur = mat.uniforms.uOpacity.value as number
    const next = cur + (target - cur) * kIn
    mat.uniforms.uOpacity.value = next < 0.004 ? 0 : next
    mat.uniforms.uCenter.value.set(s.position[0], s.position[1], s.position[2])
    mat.uniforms.uScale.value = s.glow * (1.5 + 0.62 * next)
    mat.uniforms.uColor.value.set(s.color[0], s.color[1], s.color[2])
    mat.uniforms.uSeed.value = (idx * 0.618) % 1
    mat.uniforms.uBright.value = s.bright * (runtime.obs >= s.time ? 1 : 0.1)
  })

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={26} />
}
