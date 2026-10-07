import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { hash32, signed, unit } from '../../core/math'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 环绕星尘
 * ---------------------------------------------------------------------------
 * 每一颗人生星周围都有一圈极淡的星尘在缓慢公转 —— 它在远景里让星体看起来
 * 有一层毛边，在近景里则是「这颗星还活着」的证据。
 *
 * 它同时承担新星诞生仪式最关键的一段：星尘受引力影响，一边旋转一边向
 * 正在形成的星核缓慢汇聚（uConverge 0 → 1）。粒子位置全部在顶点着色器里算，
 * CPU 每帧只写一个 uniform。
 */

interface DustArrays {
  parent: Float32Array
  normal: Float32Array
  param: Float32Array
  seed: Float32Array
  storyTime: Float32Array
  count: number
}

export function StarDust() {
  const universe = useLife((s) => s.universe)
  const quality = useLife((s) => s.quality)
  const perStar = QUALITY[quality].starDustPerStar

  const arrays = useMemo<DustArrays>(() => {
    const stars = universe.stars
    const total = Math.min(2600, stars.length * perStar)
    const parent = new Float32Array(Math.max(1, total) * 3)
    const normal = new Float32Array(Math.max(1, total) * 3)
    const param = new Float32Array(Math.max(1, total) * 4)
    const seed = new Float32Array(Math.max(1, total))
    const storyTime = new Float32Array(Math.max(1, total))
    if (total === 0) return { parent, normal, param, seed, storyTime, count: 0 }

    let w = 0
    for (let si = 0; si < stars.length && w < total; si++) {
      const s = stars[si]
      const st = hash32(s.id)
      const n = Math.min(perStar, total - w)
      const nx = signed(st, 1)
      const ny = signed(st, 2) * 0.7 + (unit(st, 3) > 0.5 ? 0.6 : -0.55)
      const nz = signed(st, 4)
      const nl = Math.hypot(nx, ny + 0.001, nz) || 1
      for (let i = 0; i < n; i++) {
        const k = w + i
        parent[k * 3] = s.position[0]
        parent[k * 3 + 1] = s.position[1]
        parent[k * 3 + 2] = s.position[2]
        normal[k * 3] = nx / nl
        normal[k * 3 + 1] = ny / nl
        normal[k * 3 + 2] = nz / nl
        // radius / speed / phase / wobble
        param[k * 4] = s.glow * (1.15 + unit(st, i * 7 + 21) * 1.5)
        param[k * 4 + 1] = 0.08 + unit(st, i * 7 + 22) * 0.22
        param[k * 4 + 2] = unit(st, i * 7 + 23) * Math.PI * 2
        param[k * 4 + 3] = 0.12 + unit(st, i * 7 + 24) * 0.4
        seed[k] = unit(st, i * 7 + 25)
        storyTime[k] = s.time
      }
      w += n
    }
    return { parent, normal, param, seed, storyTime, count: w }
  }, [universe.stars, perStar])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    if (arrays.count === 0) return g
    g.setAttribute('position', new THREE.BufferAttribute(arrays.parent.slice(0, arrays.count * 3), 3))
    g.setAttribute('aNormal', new THREE.BufferAttribute(arrays.normal.slice(0, arrays.count * 3), 3))
    g.setAttribute('aParam', new THREE.BufferAttribute(arrays.param.slice(0, arrays.count * 4), 4))
    g.setAttribute('aSeed', new THREE.BufferAttribute(arrays.seed.slice(0, arrays.count), 1))
    g.setAttribute('aTime', new THREE.BufferAttribute(arrays.storyTime.slice(0, arrays.count), 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return g
  }, [arrays])

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
          uConverge: { value: 0 },
          uConvergeTarget: { value: new THREE.Vector3(0, 0, 0) },
          uConvergeRadius: { value: 6 },
          uTint: { value: new THREE.Vector3(0.72, 0.82, 0.92) },
          uOpacity: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aNormal;
          attribute vec4 aParam;
          attribute float aSeed;
          attribute float aTime;
          uniform float uTime;
          uniform float uObs;
          uniform float uBoot;
          uniform float uDim;
          uniform float uPixelRatio;
          uniform float uConverge;
          uniform vec3 uConvergeTarget;
          uniform float uConvergeRadius;
          varying float vAlpha;
          varying float vSeed;

          void main() {
            float future = smoothstep(0.0, 0.045, aTime - uObs);
            float ignite = smoothstep(aTime - 0.06, aTime + 0.17, uBoot);
            float live = (1.0 - future) * ignite;

            vec3 nrm = normalize(aNormal);
            vec3 ref = abs(nrm.y) > 0.92 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
            vec3 t1 = normalize(cross(ref, nrm));
            vec3 t2 = cross(nrm, t1);

            float ph = aParam.z + uTime * aParam.y;
            vec3 local = t1 * (cos(ph) * aParam.x)
                       + t2 * (sin(ph) * aParam.x)
                       + nrm * (sin(ph * 0.7 + aSeed * 21.0) * aParam.x * aParam.w);
            vec3 world = position + local;

            float influence = 0.0;
            if (uConverge > 0.001) {
              float d = distance(world, uConvergeTarget);
              influence = uConverge * smoothstep(uConvergeRadius, uConvergeRadius * 0.12, d);
              vec3 rel = world - uConvergeTarget;
              float ang = influence * (2.35 + aParam.y * 1.6);
              float ca = cos(ang);
              float sa = sin(ang);
              vec3 rot = vec3(rel.x * ca - rel.z * sa, rel.y * 0.86, rel.x * sa + rel.z * ca);
              world = uConvergeTarget + rot * mix(1.0, 0.045, influence);
            }

            vec4 mv = modelViewMatrix * vec4(world, 1.0);
            gl_Position = projectionMatrix * mv;
            float atten = clamp(52.0 / max(1.2, -mv.z), 0.18, 3.2);
            gl_PointSize = clamp(aParam.x * 3.4 * atten * uPixelRatio, 0.6, 7.0);

            vAlpha = live * uDim * (0.16 + aSeed * 0.3) * (1.0 + influence * 2.6);
            vSeed = aSeed;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTint;
          uniform float uOpacity;
          varying float vAlpha;
          varying float vSeed;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            float a = exp(-d * d * 4.0) * (1.0 - smoothstep(0.7, 1.0, d));
            vec3 col = mix(uTint, vec3(1.0), 0.35 + vSeed * 0.4);
            gl_FragColor = vec4(col * a * vAlpha * uOpacity, 1.0);
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
    runtime.register('starDust', material)
    return () => runtime.unregister('starDust')
  }, [material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  if (arrays.count === 0) return null
  return <points renderOrder={16} geometry={geometry} material={material} frustumCulled={false} />
}
