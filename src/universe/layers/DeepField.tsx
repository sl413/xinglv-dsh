import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { srgbToLinear } from '../../core/domains'
import { NOISE_GLSL } from '../shaders/common'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 第一空间层级 · 极远恒星与银河
 * ---------------------------------------------------------------------------
 * 这一层不是背景图，而是真实的三维球壳：相机移动时它会有（很轻微的）视差，
 * 银河带的方向与人生星河的盘面刻意对齐 —— 你的星河，长在一整条银河里。
 *
 * 亮度原则：整层峰值亮度只有 0.1 上下。80% 的黑暗是留白，不是没画完。
 */

const SHELL_RADIUS = 640

function vec(x: number, y: number, z: number): [number, number, number] {
  return [x, y, z]
}

interface StarArrays {
  position: Float32Array
  color: Float32Array
  size: Float32Array
  seed: Float32Array
  bright: Float32Array
  count: number
}

const PALETTE: Array<{ color: [number, number, number]; weight: number; lo: number; hi: number }> = [
  { color: srgbToLinear('#cfdae6'), weight: 0.47, lo: 0.22, hi: 0.7 }, // 冷白
  { color: srgbToLinear('#9fbccb'), weight: 0.19, lo: 0.2, hi: 0.6 }, // 雾青
  { color: srgbToLinear('#d8c39a'), weight: 0.13, lo: 0.18, hi: 0.52 }, // 极淡琥珀
  { color: srgbToLinear('#c9a6ad'), weight: 0.1, lo: 0.17, hi: 0.46 }, // 淡玫瑰
  { color: srgbToLinear('#eef4fb'), weight: 0.11, lo: 0.6, hi: 1.35 }, // 少数亮星
]

function buildFarStars(count: number): StarArrays {
  let seed = 0x5eed1a7
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 4294967296
  }
  const gauss = () => {
    const u = Math.max(1e-6, rand())
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  }

  // 26 个疏散星团：让天球不是均匀噪点，而是有疏密的
  const clusters: Array<{ x: number; y: number; z: number; spread: number }> = []
  for (let c = 0; c < 26; c++) {
    const a = rand() * Math.PI * 2
    const lat = (rand() - 0.5) * 0.52
    const r = 180 + rand() * 360
    clusters.push({
      x: Math.cos(a) * Math.cos(lat) * r,
      y: Math.sin(lat) * r,
      z: Math.sin(a) * Math.cos(lat) * r,
      spread: 7 + rand() * 24,
    })
  }

  const weightTotal = PALETTE.reduce((s, p) => s + p.weight, 0)
  const position = new Float32Array(count * 3)
  const color = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const seedArr = new Float32Array(count)
  const bright = new Float32Array(count)

  for (let i = 0; i < count; i++) {
    let x: number
    let y: number
    let z: number
    const roll = rand()
    if (roll < 0.24 && clusters.length > 0) {
      const c = clusters[Math.floor(rand() * clusters.length)]
      x = c.x + gauss() * c.spread
      y = c.y + gauss() * c.spread * 0.72
      z = c.z + gauss() * c.spread
    } else if (roll < 0.7) {
      // 银河带：纬度按高斯收拢
      const a = rand() * Math.PI * 2
      const lat = gauss() * 0.135
      const r = 200 + Math.pow(rand(), 0.62) * 400
      x = Math.cos(a) * Math.cos(lat) * r
      y = Math.sin(lat) * r
      z = Math.sin(a) * Math.cos(lat) * r
    } else {
      const u = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const s = Math.sqrt(Math.max(0, 1 - u * u))
      const r = 230 + rand() * 370
      x = s * Math.cos(a) * r
      y = u * r
      z = s * Math.sin(a) * r
    }
    position[i * 3] = x
    position[i * 3 + 1] = y
    position[i * 3 + 2] = z

    let pick = rand() * weightTotal
    let p = PALETTE[0]
    for (const cand of PALETTE) {
      pick -= cand.weight
      if (pick <= 0) {
        p = cand
        break
      }
    }
    // 大气般的色差：略微偏一点色相，避免整片星都是同一个白
    const tint = 0.88 + rand() * 0.24
    color[i * 3] = p.color[0] * tint
    color[i * 3 + 1] = p.color[1] * tint
    color[i * 3 + 2] = p.color[2] * tint

    size[i] = 0.75 + Math.pow(rand(), 2.6) * 2.7
    seedArr[i] = rand()
    bright[i] = p.lo + rand() * (p.hi - p.lo)
  }

  return { position, color, size, seed: seedArr, bright, count }
}

function registerMaterial(key: string, mat: THREE.ShaderMaterial): () => void {
  runtime.register(key, mat)
  return () => runtime.unregister(key)
}

export function DeepField() {
  const quality = useLife((s) => s.quality)
  const profile = QUALITY[quality]

  const far = useMemo(() => buildFarStars(profile.farStars), [profile.farStars])
  const shellRef = useRef<THREE.ShaderMaterial>(null)
  const starsRef = useRef<THREE.ShaderMaterial>(null)

  const starGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(far.position, 3))
    g.setAttribute('aColor', new THREE.BufferAttribute(far.color, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(far.size, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(far.seed, 1))
    g.setAttribute('aBright', new THREE.BufferAttribute(far.bright, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), SHELL_RADIUS)
    return g
  }, [far])

  const starMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
          uBoot: { value: 0 },
          uTwinkle: { value: 1 },
          uObs: { value: 1 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aColor;
          attribute float aSize;
          attribute float aSeed;
          attribute float aBright;
          uniform float uTime;
          uniform float uPixelRatio;
          uniform float uBoot;
          uniform float uTwinkle;
          varying vec3 vColor;
          varying float vAlpha;
          varying float vSpike;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float tw = 0.8 + 0.2 * sin(uTime * (0.5 + aSeed * 1.7) + aSeed * 39.0);
            float size = aSize * uPixelRatio * (270.0 / max(70.0, -mv.z));
            // 只有最亮的那一小撮星带星芒：参考图里星芒很醒目，但绝不该满屏十字。
            // 阈值取在亮度最顶端，所以是「几颗亮星有星芒」，不是一层网格。
            vSpike = step(0.972, aBright);
            gl_PointSize = clamp(size * mix(1.0, tw, uTwinkle) * (1.0 + vSpike * 1.5), 0.45, 6.4);
            vColor = aColor;
            vAlpha = aBright * uBoot * mix(1.0, tw, uTwinkle * 0.8);
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec3 vColor;
          varying float vAlpha;
          varying float vSpike;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            // 极远恒星必须是「一个点」，不是一团雾：核心权重远大于柔边
            float soft = exp(-d * d * 7.5) * (1.0 - smoothstep(0.55, 1.0, d));
            float core = exp(-d * d * 62.0) * 1.35;
            float a = (soft * 0.72 + core) * vAlpha;
            // 十字星芒：沿两条轴的极细亮线，向外快速衰减。只对 vSpike=1 的亮星生效。
            if (vSpike > 0.5) {
              float ax = exp(-abs(p.y) * 54.0) * exp(-abs(p.x) * 4.2);
              float ay = exp(-abs(p.x) * 54.0) * exp(-abs(p.y) * 4.2);
              a += (ax + ay) * 0.34 * vAlpha;
            }
            gl_FragColor = vec4(vColor * a, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  const shellMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBoot: { value: 0 },
          uPixelRatio: { value: 1 },
          uObs: { value: 1 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uBandNormal: { value: new THREE.Vector3(0.13, 1, -0.21).normalize() },
          uColA: { value: new THREE.Vector3(...srgbToLinear('#171d3a')) },
          uColB: { value: new THREE.Vector3(...srgbToLinear('#3d5a6b')) },
          uColC: { value: new THREE.Vector3(...srgbToLinear('#6c7f9c')) },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          ${NOISE_GLSL}
          uniform float uTime;
          uniform float uBoot;
          uniform vec3 uBandNormal;
          uniform vec3 uColA;
          uniform vec3 uColB;
          uniform vec3 uColC;
          varying vec3 vDir;
          void main() {
            vec3 d = normalize(vDir);
            float bandRaw = abs(dot(d, uBandNormal));
            // 银河主带 + 一层很宽的外晕，形成「一条横贯天空的河」
            float band = exp(-pow(bandRaw * 2.85, 1.5));
            float wide = exp(-pow(bandRaw * 1.15, 1.25)) * 0.34;
            float f1 = fbm3(d * 3.1 + vec3(0.0, uTime * 0.0035, 0.0));
            float f2 = fbm3(d * 7.35 - vec3(uTime * 0.0042, 0.0, 0.0));
            float filament = smoothstep(0.31, 0.9, f1 * 0.7 + f2 * 0.44);
            float dust = smoothstep(0.28, 0.87, fbm3(d * 5.1 + 13.0));
            float lum = band * (0.14 + 0.86 * filament) * (1.0 - 0.62 * dust * band);
            lum += wide * (0.18 + 0.82 * filament) * 0.3;
            vec3 col = mix(uColA, uColB, clamp(f2 * 1.45, 0.0, 1.0));
            col = mix(col, uColC, filament * 0.55);
            gl_FragColor = vec4(col * lum * 0.24 * uBoot, 1.0);
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        transparent: true,
      }),
    [],
  )

  useEffect(() => registerMaterial('deepStars', starMat), [starMat])
  useEffect(() => registerMaterial('deepShell', shellMat), [shellMat])
  useEffect(() => {
    shellRef.current = shellMat
    starsRef.current = starMat
  }, [shellMat, starMat])

  useEffect(
    () => () => {
      starGeo.dispose()
      starMat.dispose()
      shellMat.dispose()
    },
    [starGeo, starMat, shellMat],
  )

  return (
    <group>
      <mesh renderOrder={-100} frustumCulled={false}>
        <sphereGeometry args={[SHELL_RADIUS, 48, 32]} />
        <primitive object={shellMat} attach="material" />
      </mesh>
      <points renderOrder={-90} geometry={starGeo} frustumCulled={false}>
        <primitive object={starMat} attach="material" />
      </points>
    </group>
  )
}

export { vec }
