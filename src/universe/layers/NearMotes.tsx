import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { mulberry32 } from '../../core/math'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 第四空间层级 · 近景漂浮微粒
 * ---------------------------------------------------------------------------
 * 一层永远包着相机的微粒：位置在着色器里对相机坐标取模，所以它是无限大的，
 * 相机任何移动都会立刻在眼前拉出强烈的视差与纵深。
 *
 * 镜头飞行时（uWhoosh）这些微粒会明显加速、变亮 —— 「穿越星尘」的手感
 * 不是靠镜头晃动做出来的，是靠这一层真的从你身边擦过去。
 */

const BOX = 15

export function NearMotes() {
  const quality = useLife((s) => s.quality)
  const count = QUALITY[quality].motes

  const geometry = useMemo(() => {
    const rand = mulberry32(0x9ea12)
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand() * BOX
      pos[i * 3 + 1] = rand() * BOX
      pos[i * 3 + 2] = rand() * BOX
      size[i] = 0.7 + Math.pow(rand(), 2.0) * 2.3
      seed[i] = rand()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 400)
    return g
  }, [count])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uPixelRatio: { value: 1 },
          uObs: { value: 1 },
          uCamPos: { value: new THREE.Vector3() },
          uBox: { value: BOX },
        },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aSeed;
          uniform float uTime;
          uniform float uBoot;
          uniform float uDim;
          uniform float uWhoosh;
          uniform float uPixelRatio;
          uniform vec3 uCamPos;
          uniform float uBox;
          varying float vAlpha;
          void main() {
            float rush = 1.0 + uWhoosh * 5.5;
            vec3 drift = vec3(
              sin(aSeed * 6.28318) * 0.05,
              0.018 + aSeed * 0.035,
              cos(aSeed * 4.13) * 0.05
            ) * rush;
            vec3 p = mod(position + drift * uTime - uCamPos, uBox) - uBox * 0.5 + uCamPos;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            float dist = max(0.35, -mv.z);
            float atten = clamp(3.4 / dist, 0.05, 1.6);
            gl_PointSize = clamp(aSize * atten * 26.0 * uPixelRatio, 0.6, 26.0);
            // 太近的微粒单独压暗，避免糊在镜头上
            float nearFade = smoothstep(0.35, 1.1, dist);
            vAlpha = (0.055 + aSeed * 0.13) * uBoot * uDim * nearFade * (1.0 + uWhoosh * 1.7);
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            float a = exp(-d * d * 3.0) * (1.0 - smoothstep(0.62, 1.0, d));
            gl_FragColor = vec4(vec3(0.72, 0.79, 0.88) * a * vAlpha, 1.0);
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
    runtime.register('nearMotes', material)
    return () => runtime.unregister('nearMotes')
  }, [material])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  useFrame((state) => {
    material.uniforms.uCamPos.value.copy(state.camera.position)
  })

  return <points renderOrder={30} geometry={geometry} material={material} frustumCulled={false} />
}
