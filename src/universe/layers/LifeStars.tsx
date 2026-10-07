import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { NOISE_GLSL } from '../shaders/common'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'
import { DOMAIN_INDEX } from '../../core/domains'

/**
 * 第三空间层级 · 人生星
 * ---------------------------------------------------------------------------
 * 「远看是一颗星，近看是一段人生」这句话决定了两件事：
 *
 *   1. 远景用 InstancedBufferGeometry 的相机朝向 billboard，一次 draw call 画完所有人生星。
 *      每一颗都自带四层结构：高亮星核 / 柔和内光 / 噪声 corona / 低透明外辉，
 *      外加极淡的十字星芒与缓慢呼吸。星核与 corona 用同一个 FBM 调制，
 *      所以近看的时候它不是一团糊光，而是有湍流结构的。
 *
 *   2. 视距进入近景后，由 StarCore 接管：把这一颗星换成程序化的能量细节
 *      （流动的丝状光、内层收缩、边缘弧光）。同一颗星，两种尺度。
 *
 * 颜色只表达人生领域，大小只表达用户自己定义的重要程度，
 * 亮度与外辉只表达被理解 / 被见证 / 被共鸣的程度 —— 星履没有点赞。
 */

interface StarArrays {
  center: Float32Array
  color: Float32Array
  glow: Float32Array
  core: Float32Array
  bright: Float32Array
  halo: Float32Array
  seed: Float32Array
  time: Float32Array
  birth: Float32Array
  index: Float32Array
  domain: Float32Array
  count: number
}

const VERTEX = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec3 aColor;
  attribute float aGlow;
  attribute float aCore;
  attribute float aBright;
  attribute float aHalo;
  attribute float aSeed;
  attribute float aTime;
  attribute float aBirth;
  attribute float aIndex;
  attribute float aDomain;

  uniform float uTime;
  uniform float uObs;
  uniform float uBoot;
  uniform float uDim;
  uniform float uHover;
  uniform float uSelected;
  uniform float uPressed;
  uniform float uNovaIndex;
  uniform float uNovaBirth;
  uniform float uNovaCore;
  uniform float uNovaBright;
  uniform float uNovaHalo;
  uniform float uGlowScale;
  uniform float uDomainFocus;

  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vBright;
  varying float vSeed;
  varying float vHalo;
  varying float vCore;
  varying float vHi;

  void main() {
    float isNova = 1.0 - step(0.5, abs(aIndex - uNovaIndex));
    float birth = mix(aBirth, uNovaBirth, isNova);
    float brightMul = mix(1.0, uNovaBright, isNova);
    float coreMul = mix(1.0, uNovaCore, isNova);
    float haloAdd = uNovaHalo * isNova;

    float isHover = 1.0 - step(0.5, abs(aIndex - uHover));
    float isSel = 1.0 - step(0.5, abs(aIndex - uSelected));
    float isPress = 1.0 - step(0.5, abs(aIndex - uPressed));

    // 时间回溯：观测时刻之后的星逐渐熄灭、光晕收缩
    float future = smoothstep(0.0, 0.045, aTime - uObs);
    float lit = 1.0 - 0.94 * future;
    // 启动：按人生时间顺序依次点亮，先看见最早的那颗
    float ignite = smoothstep(aTime - 0.06, aTime + 0.17, uBoot);
    float presence = lit * birth * ignite;
    float shrink = mix(1.0, 0.4, future);
    float breath = 1.0 + 0.055 * sin(uTime * 0.62 + aSeed * 27.0);

    // 仪式期间其他星辰让出一点光；被聚焦/新生的那颗不受影响
    float dim = mix(uDim, 1.0, clamp(isSel + isNova, 0.0, 1.0));

    // 领域高亮：只看某一个人生领域时，其余的星退到很暗
    float focusK = mix(1.0, mix(0.1, 1.0, step(0.5, 1.0 - abs(aDomain - uDomainFocus))), step(0.0, uDomainFocus));

    vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
    float size = aGlow * uGlowScale * shrink * breath * mix(0.5, 1.0, birth);
    size *= (1.0 + 0.16 * isHover + 0.52 * isSel) * (1.0 - 0.09 * isPress);
    size *= mix(0.72, 1.0, focusK);
    mv.xy += position.xy * size;
    gl_Position = projectionMatrix * mv;

    vQuad = position.xy;
    vColor = aColor;
    vBright = aBright * presence * dim * brightMul * focusK;
    vSeed = aSeed;
    vHalo = aHalo + haloAdd;
    vCore = aCore * coreMul;
    vHi = clamp(isHover * 0.5 + isSel * 0.9, 0.0, 1.0);
  }
`

const FRAGMENT = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  varying vec2 vQuad;
  varying vec3 vColor;
  varying float vBright;
  varying float vSeed;
  varying float vHalo;
  varying float vCore;
  varying float vHi;

  void main() {
    if (vBright < 0.0015) discard;
    float r = length(vQuad);
    if (r > 1.0) discard;
    float r2 = r * r;

    // 星核：极高次的高斯，保证「远看只有一个亮点」
    float core = exp(-r2 * (152.0 / max(0.35, vCore))) * (2.35 + 1.45 * vHi);
    // 柔和内光
    float inner = exp(-r2 * 14.0) * 0.8;
    // corona：用噪声打碎，近看有湍流
    float ang = atan(vQuad.y, vQuad.x);
    float n = fbm2(vec2(ang * 0.78 + vSeed * 13.0, r * 2.35 - uTime * 0.05 + vSeed * 4.0));
    float corona = pow(max(0.0, 1.0 - r), 2.35) * (0.26 + 0.74 * n);
    // 低透明外辉（被见证得越多，外辉越宽）
    float halo = pow(max(0.0, 1.0 - r), 5.2) * (0.2 + vHalo);
    // 只有足够亮的星才有一点点十字星芒（刻意压得很轻，避免画面里出现「线条」）
    float cross = exp(-abs(vQuad.x) * 34.0) * exp(-abs(vQuad.y) * 2.6)
                + exp(-abs(vQuad.y) * 34.0) * exp(-abs(vQuad.x) * 2.6);

    vec3 hot = mix(vColor, vec3(1.0, 0.985, 0.96), 0.68);
    vec3 col = hot * core + vColor * (inner * 0.42 + corona * 0.72 + halo);
    col += hot * cross * 0.026 * smoothstep(0.95, 1.8, vBright);

    gl_FragColor = vec4(col * vBright, 1.0);
  }
`

export function LifeStars() {
  const universe = useLife((s) => s.universe)
  const quality = useLife((s) => s.quality)

  const arrays = useMemo<StarArrays>(() => {
    const stars = universe.stars
    const count = Math.max(1, stars.length)
    const out: StarArrays = {
      center: new Float32Array(count * 3),
      color: new Float32Array(count * 3),
      glow: new Float32Array(count),
      core: new Float32Array(count),
      bright: new Float32Array(count),
      halo: new Float32Array(count),
      seed: new Float32Array(count),
      time: new Float32Array(count),
      birth: new Float32Array(count),
      index: new Float32Array(count),
      domain: new Float32Array(count),
      count: stars.length,
    }
    const ceremonyId = useLife.getState().ceremony?.starId
    stars.forEach((s, i) => {
      out.center.set(s.position, i * 3)
      out.color.set(s.color, i * 3)
      out.glow[i] = s.glow
      out.core[i] = s.core
      out.bright[i] = s.bright
      out.halo[i] = s.halo
      out.seed[i] = (i * 0.6180339887) % 1
      out.time[i] = s.time
      // 正在举行诞生仪式的那颗星，从「几乎没有」开始
      out.birth[i] = s.id === ceremonyId ? 0.001 : 1
      out.index[i] = i
      out.domain[i] = DOMAIN_INDEX[s.domain] ?? 0
    })
    return out
  }, [universe])

  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(arrays.center, 3))
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(arrays.color, 3))
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(arrays.glow, 1))
    g.setAttribute('aCore', new THREE.InstancedBufferAttribute(arrays.core, 1))
    g.setAttribute('aBright', new THREE.InstancedBufferAttribute(arrays.bright, 1))
    g.setAttribute('aHalo', new THREE.InstancedBufferAttribute(arrays.halo, 1))
    g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(arrays.seed, 1))
    g.setAttribute('aTime', new THREE.InstancedBufferAttribute(arrays.time, 1))
    g.setAttribute('aBirth', new THREE.InstancedBufferAttribute(arrays.birth, 1))
    g.setAttribute('aIndex', new THREE.InstancedBufferAttribute(arrays.index, 1))
    g.setAttribute('aDomain', new THREE.InstancedBufferAttribute(arrays.domain, 1))
    g.instanceCount = arrays.count
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
          uHover: { value: -1 },
          uSelected: { value: -1 },
          uPressed: { value: -1 },
          uNovaIndex: { value: -1 },
          uNovaBirth: { value: 0 },
          uNovaCore: { value: 1 },
          uNovaBright: { value: 1 },
          uNovaHalo: { value: 0 },
          uGlowScale: { value: 1 },
          uDomainFocus: { value: -1 },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    runtime.register('lifeStars', material)
    return () => runtime.unregister('lifeStars')
  }, [material])

  // ---------------------------------------------------------------- 星光反馈
  // 着色器里早就写好了两种反馈（悬停 +16% 大小、选中 +52% 并豁免压暗 + 高光），
  // 但 uHover / uSelected 从来没有人写入 —— 一直是 -1，所以点了星、悬停星都没有任何反应。
  // 这里把 store 里的 id 换成星星的索引喂进去。id 找不到就回 -1（不要留下上一颗的残影）。
  useEffect(() => {
    const push = () => {
      const st = useLife.getState()
      const idxOf = (id: string | null) => {
        if (!id) return -1
        const i = st.universe.byId.get(id)
        return i == null ? -1 : i
      }
      runtime.set('lifeStars', 'uHover', idxOf(st.hoveredId))
      runtime.set('lifeStars', 'uSelected', idxOf(st.focusedStarId))
    }
    push()
    // hoveredId 变化很频繁（每次鼠标划过），用订阅而不是每帧写：
    // 只在真正变化时写一次 uniform，避免无谓的 store 读取。
    return useLife.subscribe(push)
  }, [])

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  if (arrays.count === 0) return null

  return (
    <>
      {quality !== 'low' && QUALITY[quality].depthOfField ? <StarDepth arrays={arrays} /> : null}
      <mesh renderOrder={20} geometry={geometry} material={material} frustumCulled={false} />
    </>
  )
}

/**
 * 深度预写：只写深度不写颜色。
 * 全部用加法混叠的 billboard 本身不写深度，若不补这一层，
 * 后处理里的景深会拿到一张全空的深度图，整屏一起糊掉。
 * 这里用同样位置、稍小一圈的圆盘写深度，景深就有了真实的焦平面。
 */
function StarDepth({ arrays }: { arrays: StarArrays }) {
  const geometry = useMemo(() => {
    const g = new THREE.InstancedBufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    g.setIndex([0, 1, 2, 0, 2, 3])
    g.setAttribute('aCenter', new THREE.InstancedBufferAttribute(arrays.center, 3))
    g.setAttribute('aGlow', new THREE.InstancedBufferAttribute(arrays.glow, 1))
    g.setAttribute('aTime', new THREE.InstancedBufferAttribute(arrays.time, 1))
    g.instanceCount = arrays.count
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
    return g
  }, [arrays])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uObs: { value: 1 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uTime: { value: 0 },
          uPixelRatio: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aCenter;
          attribute float aGlow;
          attribute float aTime;
          uniform float uObs;
          uniform float uBoot;
          varying vec2 vQuad;
          varying float vLive;
          void main() {
            float future = smoothstep(0.0, 0.045, aTime - uObs);
            float ignite = smoothstep(aTime - 0.06, aTime + 0.17, uBoot);
            vLive = (1.0 - future) * ignite;
            vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
            mv.xy += position.xy * aGlow * 0.55;
            gl_Position = projectionMatrix * mv;
            vQuad = position.xy;
          }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vQuad;
          varying float vLive;
          void main() {
            if (vLive < 0.05) discard;
            if (length(vQuad) > 1.0) discard;
            gl_FragColor = vec4(0.0);
          }
        `,
        colorWrite: false,
        transparent: false,
      }),
    [],
  )

  useEffect(
    () => () => {
      geometry.dispose()
      material.dispose()
    },
    [geometry, material],
  )

  return <mesh renderOrder={-50} geometry={geometry} material={material} frustumCulled={false} />
}
