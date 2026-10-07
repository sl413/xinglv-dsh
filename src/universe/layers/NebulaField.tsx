import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { hash32, signed, unit } from '../../core/math'
import type { NebulaAnchor } from '../../core/layout'
import { NOISE_GLSL } from '../shaders/common'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 第二空间层级 · 中距离动态星云与宇宙尘埃
 * ---------------------------------------------------------------------------
 * 每一片星云不是一个平面贴图，而是一簇互相重叠、各自朝向相机的 billboard
 * （典型的体积感做法）：单次 draw call，靠 FBM + 域扭曲出絮状结构，
 * 中间夹着暗尘带。相机飞过时它们按真实透视产生明显视差。
 *
 * 时间回溯会真正改变结构：观测时刻之后的区域变稀薄、变冷、变朦胧，
 * 于是「当年的星空」不是少了几个点，而是整片星云都不一样了。
 */

interface PuffArrays {
  center: Float32Array
  size: Float32Array
  rot: Float32Array
  seed: Float32Array
  opacity: Float32Array
  tp: Float32Array
  tintA: Float32Array
  tintB: Float32Array
  count: number
}

function buildPuffs(nebulae: NebulaAnchor[], scale: number): PuffArrays {
  const puffs: Array<{
    c: [number, number, number]
    s: number
    rot: number
    seed: number
    opacity: number
    tp: number
    ta: [number, number, number]
    tb: [number, number, number]
  }> = []

  for (const n of nebulae) {
    const seed = n.seed
    const count = Math.max(3, Math.round(n.puffs * scale))
    for (let i = 0; i < count; i++) {
      const off: [number, number, number] = [
        signed(seed, i * 3 + 1) * n.size * 0.34,
        signed(seed, i * 3 + 2) * n.size * 0.34 * n.flatten,
        signed(seed, i * 3 + 3) * n.size * 0.34,
      ]
      puffs.push({
        c: [n.position[0] + off[0], n.position[1] + off[1], n.position[2] + off[2]],
        s: n.size * (0.44 + unit(seed, i * 5 + 11) * 0.5),
        rot: (unit(seed, i * 5 + 12) - 0.5) * 0.9 + n.spin * 1.4,
        seed: unit(seed, i * 5 + 13),
        opacity: n.opacity * (0.6 + unit(seed, i * 5 + 14) * 0.5),
        tp: tProxyOfPosition(n.position[0], n.position[2]),
        ta: n.tintA,
        tb: n.tintB,
      })
    }
  }

  const count = puffs.length
  const out: PuffArrays = {
    center: new Float32Array(count * 3),
    size: new Float32Array(count),
    rot: new Float32Array(count),
    seed: new Float32Array(count),
    opacity: new Float32Array(count),
    tp: new Float32Array(count),
    tintA: new Float32Array(count * 3),
    tintB: new Float32Array(count * 3),
    count,
  }
  puffs.forEach((p, i) => {
    out.center.set(p.c, i * 3)
    out.size[i] = p.s
    out.rot[i] = p.rot
    out.seed[i] = p.seed
    out.opacity[i] = p.opacity
    out.tp[i] = p.tp
    out.tintA.set(p.ta, i * 3)
    out.tintB.set(p.tb, i * 3)
  })
  return out
}

const R0 = 1.25
const R1 = 11.2

export function tProxyOfPosition(x: number, z: number): number {
  const r = Math.hypot(x, z)
  const t = (r - R0) / (R1 - R0)
  return t < 0 ? 0 : t > 1 ? 1 : t
}

export function NebulaField() {
  const quality = useLife((s) => s.quality)
  const universe = useLife((s) => s.universe)
  const profile = QUALITY[quality]

  const puffs = useMemo(() => buildPuffs(universe.nebulae, profile.nebulaScale), [universe.nebulae, profile.nebulaScale])

  const geometry = useMemo(() => {
    const base = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.attributes.position)
    g.setAttribute('uv', base.attributes.uv)
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(puffs.center, 3))
    g.setAttribute('aSize', new THREE.InstancedBufferAttribute(puffs.size, 1))
    g.setAttribute('aRot', new THREE.InstancedBufferAttribute(puffs.rot, 1))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(puffs.seed, 1))
    g.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(puffs.opacity, 1))
    g.setAttribute('aTp', new THREE.InstancedBufferAttribute(puffs.tp, 1))
    g.setAttribute('aTintA', new THREE.InstancedBufferAttribute(puffs.tintA, 3))
    g.setAttribute('aTintB', new THREE.InstancedBufferAttribute(puffs.tintB, 3))
    g.instanceCount = puffs.count
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 60)
    base.dispose()
    return g
  }, [puffs])

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
          uIntensity: { value: 1.35 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aCenter;
          attribute float aSize;
          attribute float aRot;
          attribute float aSeed;
          attribute float aOpacity;
          attribute float aTp;
          attribute vec3 aTintA;
          attribute vec3 aTintB;
          varying vec2 vUv;
          varying float vSeed;
          varying float vOpacity;
          varying float vTp;
          varying vec3 vTintA;
          varying vec3 vTintB;
          void main() {
            float c = cos(aRot);
            float s = sin(aRot);
            vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
            vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
            mv.xy += q * aSize;
            gl_Position = projectionMatrix * mv;
            vUv = uv;
            vSeed = aSeed;
            vOpacity = aOpacity;
            vTp = aTp;
            vTintA = aTintA;
            vTintB = aTintB;
          }
        `,
        fragmentShader: /* glsl */ `
          ${NOISE_GLSL}
          uniform float uTime;
          uniform float uObs;
          uniform float uBoot;
          uniform float uDim;
          uniform float uIntensity;
          varying vec2 vUv;
          varying float vSeed;
          varying float vOpacity;
          varying float vTp;
          varying vec3 vTintA;
          varying vec3 vTintB;
          void main() {
            vec2 uvc = (vUv - 0.5) * 2.0;
            // 轮廓用噪声扰动：否则每一团 puff 都是一个干净的圆，叠起来就是棉花球
            float warp = fbm3(vec3(uvc * 2.15, vSeed * 7.0 + uTime * 0.01));
            float r = length(uvc) * (1.0 + (warp - 0.5) * 0.9);
            float mask = smoothstep(1.0, 0.04, r);
            float t = uTime * 0.009;
            vec3 p = vec3(uvc * 2.05 + vec2(vSeed * 7.0, -vSeed * 3.0), vSeed * 9.0);
            p.xy += vec2(t, -t * 0.72);
            float wx = fbm3(p * 0.85);
            float wy = fbm3(p * 0.85 + 19.0);
            vec2 w = uvc + vec2(wx - 0.5, wy - 0.5) * 0.88;
            float cloud = fbm3(vec3(w * 2.35, vSeed * 5.0 + uTime * 0.014));
            float fine = fbm3(vec3(w * 6.4, vSeed * 2.0 - uTime * 0.018));
            float density = smoothstep(0.35, 0.87, cloud * 0.78 + fine * 0.34);
            float lane = smoothstep(0.33, 0.78, fbm3(vec3(uvc * 3.5 + vSeed, uTime * 0.011)));
            density *= mix(1.0, 0.34, lane * 0.8);
            float future = smoothstep(uObs - 0.03, uObs + 0.13, vTp);
            density *= mix(1.0, 0.15, future);
            vec3 col = mix(vTintA, vTintB, clamp(cloud * 1.5, 0.0, 1.0));
            col = mix(col, vec3(0.04, 0.045, 0.08), future * 0.72);
            float a = density * mask * vOpacity * uBoot * uDim;
            gl_FragColor = vec4(col * a * uIntensity, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    runtime.register('nebula', material)
    return () => runtime.unregister('nebula')
  }, [material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  if (puffs.count === 0) return null

  return <mesh renderOrder={-40} geometry={geometry} material={material} frustumCulled={false} />
}

/** 星云的确定性种子（给外部做调试/复现用） */
export function nebulaSeedOf(id: string): number {
  return hash32(id)
}
