import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { mulberry32 } from '../../core/math'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 第二空间层级的下半部分 · 中距离宇宙尘埃
 * ---------------------------------------------------------------------------
 * 真实的三维分布（不是贴图），并带有差速公转：越靠外的尘埃转得越慢。
 * 相机在星盘内移动时，这一层贡献了大量中景视差。
 */

export function MidDust() {
  const quality = useLife((s) => s.quality)
  const count = QUALITY[quality].midDust

  const geometry = useMemo(() => {
    const rand = mulberry32(0x51de0)
    const gauss = () => {
      const u = Math.max(1e-6, rand())
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
    }
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const seed = new Float32Array(count)
    const speed = new Float32Array(count)
    const color = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const r = 4.2 + Math.pow(rand(), 0.7) * 34
      const a = rand() * Math.PI * 2
      const y = gauss() * (1.1 + r * 0.075)
      pos[i * 3] = Math.cos(a) * r + gauss() * 1.5
      pos[i * 3 + 1] = y
      pos[i * 3 + 2] = Math.sin(a) * r + gauss() * 1.5
      size[i] = 2.5 + Math.pow(rand(), 2.2) * 16
      seed[i] = rand()
      speed[i] = 0.35 / Math.max(0.4, Math.pow(r / 6, 1.25))
      const t = rand()
      // 深空色调：雾青 / 暗紫灰 / 冷白 之间极低饱和地过渡
      color[i * 3] = 0.24 + t * 0.24
      color[i * 3 + 1] = 0.3 + t * 0.22
      color[i * 3 + 2] = 0.4 + t * 0.2
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 46)
    return g
  }, [count])

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
        },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aSeed;
          attribute float aSpeed;
          attribute vec3 aColor;
          uniform float uTime;
          uniform float uObs;
          uniform float uBoot;
          uniform float uDim;
          uniform float uPixelRatio;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            float a = aSpeed * uTime * 0.075;
            float c = cos(a);
            float s = sin(a);
            vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
            float tp = clamp((length(p.xz) - 1.25) / 9.35, 0.0, 1.0);
            float future = smoothstep(uObs - 0.03, uObs + 0.13, tp);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float atten = clamp(85.0 / max(2.0, -mv.z), 0.22, 4.0);
            gl_PointSize = clamp(aSize * atten * uPixelRatio * 0.5, 0.5, 14.0);
            vAlpha = (0.045 + aSeed * 0.13) * uBoot * uDim * mix(1.0, 0.16, future);
            vColor = aColor;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            float a = exp(-d * d * 3.2) * (1.0 - smoothstep(0.68, 1.0, d));
            gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
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
    runtime.register('midDust', material)
    return () => runtime.unregister('midDust')
  }, [material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <points renderOrder={-30} geometry={geometry} material={material} frustumCulled={false} />
}
