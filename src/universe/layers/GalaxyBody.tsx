import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { DOMAIN_COUNT, srgbToLinear } from '../../core/domains'
import { GALAXY, domainFocusIndexOf, type ArmGeometry, type GalaxyDensity } from '../../core/layout'
import { clamp01, mulberry32, signed, smoothstep, unit } from '../../core/math'
import { NOISE_GLSL } from '../shaders/common'
import { runtime } from '../runtime'
import { QUALITY } from '../quality'
import { useLife } from '../../state/store'

/**
 * 星河的「体」
 * ---------------------------------------------------------------------------
 * 那些锐利的星点（人生星）只代表**你真正记下来的经历**；
 * 这一层负责的是星河的**形态**：十道星臂的辉光、中心的核球、盘面的星尘。
 *
 * 关键的一条设计原则：**这一层随你记录的数量增长。**
 *   记得少 → 星臂只是几缕几乎看不见的轮廓，核球很淡；
 *   记得多 → 星臂变亮、核球变实、盘面星尘变厚，整片星河真正壮观起来。
 * 换句话说，星的亮度是数据，星河的体量是「你积累了多少人生」。
 *
 * 分三层实现：
 *   1. DiskGlow   —— 一张躺在星盘平面里的大圆，用解析式十臂螺旋算出盘面辉光、
 *                    核球与暗尘带。整片星河的「盘」就靠它。
 *   2. ArmPuffs   —— 沿星臂中心线分布的柔和 billboard（含核球与一道极淡的横向光斑），
 *                    提供体积感与泛光来源。
 *   3. DiskDust   —— 沿星臂与盘面分布的细小尘埃点，负责那种密集的颗粒质感。
 */

/* ---------------------------------------------------------------- 1. 盘面辉光 */

const DISK_VERT = /* glsl */ `
  varying vec2 vLocal;
  varying float vR;
  void main() {
    vLocal = position.xy;
    vR = length(position.xy);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const DISK_FRAG = /* glsl */ `
  ${NOISE_GLSL}
  uniform float uTime;
  uniform float uObs;
  uniform float uBoot;
  uniform float uDim;
  uniform float uStrength;
  uniform float uR0;
  uniform float uR1;
  uniform float uPow;
  uniform float uWind;
  uniform float uArmWidth;
  uniform float uCore;
  uniform float uDomainFocus;
  uniform float uNear;
  uniform float uArmStrength[10];
  uniform vec3 uColorInner;
  uniform vec3 uColorOuter;
  uniform vec3 uColorArm;
  uniform vec3 uColorHii;
  uniform vec3 uColorViolet;
  uniform float uDetail;
  varying vec2 vLocal;
  varying float vR;

  // 与 CPU 侧 armAngle(i) 完全一致：i*(2π/10) + 0.33*sin(i*2.13)
  // 星臂上的点是 θ = armAngle(i) + WIND·t，所以脊线必须减去 base。
  float armRidge(float r, float th) {
    float rn = clamp((r - uR0) / max(0.0001, uR1 - uR0), 0.0, 1.0);
    float t = pow(rn, 1.0 / uPow);
    float base = uWind * t;
    float d0 = th - base;
    float sum = 0.0;
    for (int i = 0; i < 10; i++) {
      float fi = float(i);
      float ai = fi * 0.62831853 + 0.33 * sin(fi * 2.13);
      // 领域高亮：只看某一个领域时，其他星臂退到几乎看不见
      float w = mix(1.0, step(0.5, 1.0 - abs(fi - uDomainFocus)), step(0.0, uDomainFocus));
      float d = d0 - ai;
      d = d - 6.2831853 * floor(d / 6.2831853 + 0.5);
      sum += uArmStrength[i] * w * exp(-pow(d / uArmWidth, 2.0));
    }
    return sum;
  }

  void main() {
    float r = vR;
    // 世界坐标里 z = -local.y，所以方位角要取负
    float th = atan(-vLocal.y, vLocal.x);
    float rn = clamp((r - uR0) / max(0.0001, uR1 - uR0), 0.0, 1.0);

    // 核球分两层：紧实的内核 + 一圈更宽的暖雾（参考图里核球外面还裹着一层辉光）
    float coreTight = exp(-pow(r / (uR1 * 0.048), 2.0));
    float coreWide = exp(-pow(r / (uR1 * 0.34), 1.5));
    float disk = exp(-pow(r / (uR1 * 0.72), 1.6));
    float ridges = armRidge(r, th);

    float f1 = fbm3(vec3(vLocal * 0.52, uTime * 0.010));

    // ---------------------------------------------------------------- 域扭曲
    // 这是把「云」变成「丝」的关键一步：直接对噪声取阈值只会得到一团团斑块，
    // 而先用一层低频噪声去**偏移另一层噪声的采样位置**，才会长出参考图里那种
    // 有分支、成网状的暗尘结构。
    float warp = fbm3(vec3(vLocal * 0.30 + 23.0, uTime * 0.004));
    float dustN = fbm3(vec3(vLocal * 1.55 + warp * 1.35 + 5.0, -uTime * 0.007));

    // 第二级扭曲：再拿上面那层的**结果**去扭曲一个更细的噪声场。
    // 一级扭曲给出「丝」，二级才给出「丝上的毛刺」—— 参考图的细节密度主要来自这里。
    // 用 uniform 分支：低画质档 detail=0，GPU 上所有像素走同一分支，这部分是真的省掉。
    float warp2 = 0.0;
    float dustFine = 0.5;
    float dustGrit = 0.5;
    if (uDetail > 0.4) {
      warp2 = fbm3(vec3(vLocal * 0.95 + dustN * 0.85 + 67.0, uTime * 0.009));
      dustFine = fbm3(vec3(vLocal * 4.1 + warp2 * 1.15 + 13.0, -uTime * 0.013));
      // 第三级：极高频的「尘粒」。参考图的细节密度是这里的 4 倍（实测梯度能量 9.85 vs 2.44），
      // 光靠中层扭曲补不上 —— 必须再加一层频率高得多的场。它不改变大局结构，只把颗粒感堆上去。
      dustGrit = fbm3(vec3(vLocal * 9.5 + dustFine * 1.6 + 91.0, uTime * 0.018));
    }

    // 脊线要窄：十条星臂间距 36°，脊宽超过一半就会互相连成一块均匀的盘
    float density = disk * (0.055 + 2.55 * ridges) * (0.40 + 0.82 * f1);

    // 核球内部还有自己紧密的旋涡 —— 参考图里核心不是一团均匀亮斑。
    // 这一项不花噪声开销，只是把核球按方位角与半径做一次正弦调制。
    float nuclear = 0.5 + 0.5 * sin(th * 2.0 + r * 8.5 + warp * 2.2);
    density += coreTight * (0.42 + 0.24 * nuclear + 0.16 * f1) * uCore;
    density += coreWide * 0.14 * uCore;

    // 暗尘：两级 + 扭曲。宽暗带定格局，细尘丝给密度，最暗压到 3% 才有塑形感
    float laneMask = smoothstep(0.36, 0.68, dustN * 1.22) * disk;
    density *= mix(1.0, 0.075, laneMask);
    // 细丝：一级扭曲的场 + 二级细场一起用；只在盘面中段出现，免得把核球和外缘切碎
    float filament = smoothstep(0.56, 0.86, dustN * 0.72 + f1 * 0.62);
    filament = max(filament, smoothstep(0.58, 0.88, dustFine) * uDetail);
    filament = max(filament, smoothstep(0.54, 0.86, dustGrit) * uDetail * 0.85);
    filament *= smoothstep(0.04, 0.22, rn) * smoothstep(1.0, 0.55, rn);
    density *= mix(1.0, 0.42, filament);

    // 外缘柔和收边
    density *= smoothstep(1.0, 0.66, r / (uR1 * 1.12));

    // 恒星形成区：沿星臂的玫红发光结。让它出现在暗尘较薄的地方 —— 真实的星暴区
    // 就长在尘埃被吹开的位置，两者相关而不是随机叠加。
    // 分两级：成片的 HII 区 + 更亮更小的高密度结，后者才是参考图里那些粉色亮点。
    float hii = smoothstep(0.50, 0.84, dustN) * smoothstep(0.12, 0.62, ridges);
    float hiiCore = smoothstep(0.70, 0.95, dustN * 0.8 + f1 * 0.5) * smoothstep(0.20, 0.70, ridges);
    density += (hii * 0.55 + hiiCore * 1.25) * disk;

    // 时间回溯：观测时刻之外的盘面整体退去
    float tR = pow(clamp(r / (uR1 * 1.12), 0.0, 1.0), 1.0 / uPow);
    float future = smoothstep(uObs - 0.02, uObs + 0.14, tR);
    density *= mix(1.0, 0.05, future);

    vec3 col = mix(uColorInner, uColorOuter, smoothstep(0.0, 0.58, rn));
    col = mix(col, uColorArm, clamp(ridges, 0.0, 1.0) * 0.42);
    // 贴住星臂的地方再压一点紫 —— 参考图的年轻星区是蓝中带紫，不是纯蓝
    col = mix(col, uColorViolet, clamp(ridges, 0.0, 1.0) * rn * 0.30);
    col = mix(col, uColorHii, clamp(hii * 1.5 + hiiCore * 1.1, 0.0, 1.0));

    gl_FragColor = vec4(col * density * uStrength * uBoot * uDim * uNear, 1.0);
  }
`

function register(key: string, mat: THREE.ShaderMaterial): () => void {
  runtime.register(key, mat)
  return () => runtime.unregister(key)
}

function armStrengths(arms: ArmGeometry[]): Float32Array {
  const arr = new Float32Array(Math.max(1, DOMAIN_COUNT))
  for (const a of arms) {
    if (a.index >= 0 && a.index < arr.length) arr[a.index] = a.strength
  }
  return arr
}

/* ------------------------------------------------------------------ 主体 */

export function GalaxyBody() {
  const universe = useLife((s) => s.universe)
  const quality = useLife((s) => s.quality)
  const arms = universe.arms
  const density = universe.density

  /* --- 1) 盘面辉光 --- */
  const diskMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uObs: { value: 1 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uPixelRatio: { value: 1 },
          uStrength: { value: 0.115 },
          uR0: { value: GALAXY.R0 },
          uR1: { value: GALAXY.R1 },
          uPow: { value: GALAXY.RADIAL_POW },
          uWind: { value: GALAXY.WIND },
          uArmWidth: { value: 0.155 },
          uCore: { value: 1 },
          uDomainFocus: { value: -1 },
          uNear: { value: 1 },
          uArmStrength: { value: new Float32Array(DOMAIN_COUNT) },
          uColorInner: { value: new THREE.Vector3(...srgbToLinear('#ffcf8a')) },
          uColorOuter: { value: new THREE.Vector3(...srgbToLinear('#6f9dff')) },
          uColorArm: { value: new THREE.Vector3(...srgbToLinear('#a8c0ff')) },
          uColorHii: { value: new THREE.Vector3(...srgbToLinear('#ff6aa8')) },
          uColorViolet: { value: new THREE.Vector3(...srgbToLinear('#8f9dff')) },
          uDetail: { value: 1 },
        },
        vertexShader: DISK_VERT,
        fragmentShader: DISK_FRAG,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => {
    diskMat.uniforms.uArmStrength.value = armStrengths(arms)
    diskMat.uniforms.uCore.value = 1.0 + density.coreScale * 1.15
    diskMat.uniforms.uStrength.value = 0.115 + density.gasScale * 0.165
    // 细节密度跟着画质档位走：低档位在着色器里直接跳过第二级域扭曲（uniform 分支，真的省）
    diskMat.uniforms.uDetail.value = QUALITY[quality].detail
  }, [diskMat, arms, density, quality])

  const diskGeo = useMemo(() => {
    const g = new THREE.CircleGeometry(GALAXY.R1 * 1.16, 128)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY.R1 * 1.3)
    return g
  }, [])

  useEffect(() => register('galaxyDisk', diskMat), [diskMat])
  useEffect(() => () => diskGeo.dispose(), [diskGeo])

  /**
   * 飞进盘面里的时候，星云的辉光要把自己收起来。
   * 否则近看一颗星时，整个画面会糊成一层灰雾 —— 那不是「黑暗中的光」。
   */
  useFrame((state) => {
    const d = Math.hypot(state.camera.position.x, state.camera.position.y, state.camera.position.z)
    diskMat.uniforms.uNear.value = 0.22 + 0.78 * smoothstep(4, 17, d)
    puffMat.uniforms.uNear.value = 0.3 + 0.7 * smoothstep(3, 15, d)
    dustMat.uniforms.uNear.value = 0.26 + 0.74 * smoothstep(3, 14, d)
  })

  /* --- 2) 星臂辉光 + 核球 + 横向光斑 --- */
  const puffs = useMemo(() => buildPuffs(arms, density), [arms, density])

  const puffGeo = useMemo(() => {
    const geo = new THREE.InstancedBufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3))
    geo.setIndex([0, 1, 2, 0, 2, 3])
    geo.setAttribute('aCenter', new THREE.InstancedBufferAttribute(puffs.center, 3))
    geo.setAttribute('aScale', new THREE.InstancedBufferAttribute(puffs.scale, 2))
    geo.setAttribute('aRot', new THREE.InstancedBufferAttribute(puffs.rot, 1))
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(puffs.seed, 1))
    geo.setAttribute('aColor', new THREE.InstancedBufferAttribute(puffs.color, 3))
    geo.setAttribute('aOpacity', new THREE.InstancedBufferAttribute(puffs.opacity, 1))
    geo.instanceCount = puffs.count
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY.R1 * 1.5)
    return geo
  }, [puffs])

  const puffMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uObs: { value: 1 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uPixelRatio: { value: 1 },
          uNear: { value: 1 },
          uObsR: { value: GALAXY.R1 },
          uTimeR0: { value: GALAXY.R0 },
          uTimeR1: { value: GALAXY.R1 },
        },
        vertexShader: /* glsl */ `
          attribute vec3 aCenter;
          attribute vec2 aScale;
          attribute float aRot;
          attribute float aSeed;
          attribute vec3 aColor;
          attribute float aOpacity;
          uniform float uTime;
          uniform float uObs;
          uniform float uBoot;
          uniform float uDim;
          uniform float uNear;
          varying vec2 vQ;
          varying vec3 vColor;
          varying float vOpacity;
          varying float vSeed;
          void main() {
            float c = cos(aRot);
            float s = sin(aRot);
            vec2 q = vec2(position.x * c - position.y * s, position.x * s + position.y * c);
            vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
            mv.xy += q * aScale;
            gl_Position = projectionMatrix * mv;
            float r = length(aCenter.xz);
            float tR = clamp((r - 0.85) / 10.95, 0.0, 1.0);
            float future = smoothstep(0.0, 0.09, tR - uObs);
            vQ = position.xy;
            vColor = aColor;
            vOpacity = aOpacity * uBoot * uDim * uNear * (1.0 - 0.92 * future);
            vSeed = aSeed;
          }
        `,
        fragmentShader: /* glsl */ `
          ${NOISE_GLSL}
          uniform float uTime;
          varying vec2 vQ;
          varying vec3 vColor;
          varying float vOpacity;
          varying float vSeed;
          void main() {
            if (vOpacity < 0.002) discard;
            float r = length(vQ);
            if (r > 1.0) discard;
            float n = fbm2(vec2(vQ.x * 1.6 + vSeed * 9.0, vQ.y * 1.6 - uTime * 0.02 + vSeed * 3.0));
            float soft = pow(max(0.0, 1.0 - r), 2.6) * (0.55 + 0.75 * n);
            gl_FragColor = vec4(vColor * soft * vOpacity, 1.0);
          }
        `,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  )

  useEffect(() => register('galaxyPuffs', puffMat), [puffMat])
  useEffect(() => {
    return () => {
      puffGeo.dispose()
      puffMat.dispose()
      diskMat.dispose()
    }
  }, [puffGeo, puffMat, diskMat])

  /* --- 3) 盘面星尘 --- */

  const dust = useMemo(() => buildDust(arms, density), [arms, density])

  const dustGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(dust.position, 3))
    g.setAttribute('aSize', new THREE.BufferAttribute(dust.size, 1))
    g.setAttribute('aSeed', new THREE.BufferAttribute(dust.seed, 1))
    g.setAttribute('aColor', new THREE.BufferAttribute(dust.color, 3))
    g.setAttribute('aDomain', new THREE.BufferAttribute(dust.domain, 1))
    g.setAttribute('aTime', new THREE.BufferAttribute(dust.time, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), GALAXY.R1 * 1.6)
    return g
  }, [dust])

  const dustMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uObs: { value: 1 },
          uBoot: { value: 0 },
          uDim: { value: 1 },
          uWhoosh: { value: 0 },
          uPixelRatio: { value: 1 },
          uDomainFocus: { value: -1 },
          uNear: { value: 1 },
        },
        vertexShader: /* glsl */ `
          attribute float aSize;
          attribute float aSeed;
          attribute vec3 aColor;
          attribute float aDomain;
          attribute float aTime;
          uniform float uTime;
          uniform float uObs;
          uniform float uBoot;
          uniform float uDim;
          uniform float uPixelRatio;
          uniform float uDomainFocus;
          uniform float uNear;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            // 盘面差速转动：越靠外越慢
            float r = length(position.xz);
            float w = 0.055 / pow(max(0.6, r / 6.0), 1.15);
            float a = w * uTime;
            float c = cos(a);
            float s = sin(a);
            vec3 p = vec3(position.x * c - position.z * s, position.y, position.x * s + position.z * c);
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(aSize * uPixelRatio * clamp(46.0 / max(2.0, -mv.z), 0.3, 3.0), 0.5, 3.4);
            float future = smoothstep(0.0, 0.07, aTime - uObs);
            float focus = mix(1.0, mix(0.16, 1.0, step(0.5, 1.0 - abs(aDomain - uDomainFocus))), step(0.0, uDomainFocus));
            vAlpha = (0.1 + aSeed * 0.3) * uBoot * uDim * uNear * focus * (1.0 - 0.94 * future);
            vColor = aColor;
          }
        `,
        fragmentShader: /* glsl */ `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec2 p = gl_PointCoord - 0.5;
            float d = length(p) * 2.0;
            float a = exp(-d * d * 3.4) * (1.0 - smoothstep(0.62, 1.0, d));
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

  useEffect(() => register('galaxyDust', dustMat), [dustMat])
  useEffect(
    () => () => {
      dustGeo.dispose()
      dustMat.dispose()
    },
    [dustGeo, dustMat],
  )

  /** 领域高亮：星空体与盘面星尘一起响应 */
  useEffect(() => {
    const idx = domainFocusIndexOf(universe, useLife.getState().domainFocus)
    diskMat.uniforms.uDomainFocus.value = idx
    dustMat.uniforms.uDomainFocus.value = idx
  }, [diskMat, dustMat, universe])

  return (
    <group>
      {/* 盘面躺在星盘平面里：绕 X 轴 -90° 让 local.y 对应世界 -z */}
      <mesh geometry={diskGeo} material={diskMat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-24} frustumCulled={false} />
      <mesh geometry={puffGeo} material={puffMat} renderOrder={-22} frustumCulled={false} />
      <points geometry={dustGeo} material={dustMat} renderOrder={-21} frustumCulled={false} />
    </group>
  )
}

/* ------------------------------------------------------------------ 生成 */

interface PuffArrays {
  center: Float32Array
  scale: Float32Array
  rot: Float32Array
  seed: Float32Array
  color: Float32Array
  opacity: Float32Array
  count: number
}

function buildPuffs(arms: ArmGeometry[], density: GalaxyDensity): PuffArrays {
  const list: Array<{
    c: [number, number, number]
    sx: number
    sy: number
    rot: number
    seed: number
    color: [number, number, number]
    opacity: number
  }> = []

  const white = srgbToLinear('#fff3dd')
  const cool = srgbToLinear('#bcd0ea')
  const mix3 = (a: [number, number, number], b: [number, number, number], k: number): [number, number, number] => [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
  ]

  // 沿星臂的柔和辉光
  for (const arm of arms) {
    const seed = 0x1a2b3c + arm.index * 977
    const per = 26
    const n = arm.samples.length
    for (let i = 0; i < per; i++) {
      const f = (i + unit(seed, i * 5) * 0.8) / per
      const at = f * (n - 1)
      const i0 = Math.max(0, Math.min(n - 1, Math.floor(at)))
      const i1 = Math.min(n - 1, i0 + 1)
      const fr = at - i0
      const p = arm.samples[i0]
      const q = arm.samples[i1]
      const cx = p[0] + (q[0] - p[0]) * fr
      const cy = p[1] + (q[1] - p[1]) * fr
      const cz = p[2] + (q[2] - p[2]) * fr
      const r = Math.hypot(cx, cz)
      // 垂直于星臂的偏移，让辉光有宽度
      const tx = q[0] - p[0]
      const tz = q[2] - p[2]
      const tl = Math.hypot(tx, tz) || 1
      const px = -tz / tl
      const pz = tx / tl
      const off = (unit(seed, i * 7 + 31) - 0.5) * 1.5
      const lift = signed(seed, i * 7 + 32) * 0.3 * (1 + 1.2 * Math.exp(-r * 0.5))
      const size = 1.5 + unit(seed, i * 7 + 33) * 2.2
      const radial = clamp01(1.15 - r / (GALAXY.R1 * 1.05))
      list.push({
        c: [cx + px * off, cy + lift, cz + pz * off],
        sx: size,
        sy: size * (0.7 + unit(seed, i * 7 + 34) * 0.5),
        rot: unit(seed, i * 7 + 35) * Math.PI,
        seed: unit(seed, i * 7 + 36),
        color: mix3(cool, arm.color, 0.42),
        opacity: arm.strength * (0.035 + 0.05 * unit(seed, i * 7 + 37)) * (0.35 + 0.65 * radial) * density.gasScale,
      })
    }
  }

  // 核球：几层由内到外的柔光（真正的高光交给泛光去炸开）
  const coreLayers: Array<[number, number, number]> = [
    [0.7, 0.15, 0.55],
    [1.6, 0.07, 0.3],
    [3.0, 0.026, 0.16],
  ]
  coreLayers.forEach(([size, opacity, tilt], i) => {
    list.push({
      c: [0, 0, 0],
      sx: size,
      sy: size * (1 - tilt * 0.35),
      rot: 0,
      seed: 0.5 + i * 0.1,
      color: mix3(white, cool, i * 0.16),
      opacity: opacity * density.coreScale,
    })
  })

  // 一道极淡的横向光斑，给核球一点「镜头感」
  list.push({
    c: [0, 0, 0],
    sx: 7.5,
    sy: 0.38,
    rot: 0,
    seed: 0.31,
    color: white,
    opacity: 0.026 * density.coreScale,
  })

  const count = list.length
  const arrays: PuffArrays = {
    center: new Float32Array(count * 3),
    scale: new Float32Array(count * 2),
    rot: new Float32Array(count),
    seed: new Float32Array(count),
    color: new Float32Array(count * 3),
    opacity: new Float32Array(count),
    count,
  }
  list.forEach((p, i) => {
    arrays.center.set(p.c, i * 3)
    arrays.scale[i * 2] = p.sx
    arrays.scale[i * 2 + 1] = p.sy
    arrays.rot[i] = p.rot
    arrays.seed[i] = p.seed
    arrays.color.set(p.color, i * 3)
    arrays.opacity[i] = p.opacity
  })
  return arrays
}

interface DustArrays {
  position: Float32Array
  size: Float32Array
  seed: Float32Array
  color: Float32Array
  domain: Float32Array
  time: Float32Array
  count: number
}

function buildDust(arms: ArmGeometry[], density: GalaxyDensity): DustArrays {
  const count = Math.max(1, density.dustCount)
  const rand = mulberry32(0x7d4e21)
  const gauss = () => {
    const u = Math.max(1e-6, rand())
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand())
  }
  const position = new Float32Array(count * 3)
  const size = new Float32Array(count)
  const seed = new Float32Array(count)
  const color = new Float32Array(count * 3)
  const domain = new Float32Array(count)
  const time = new Float32Array(count)

  const warm = srgbToLinear('#ffe6c0')
  const cool = srgbToLinear('#cfe0f5')
  const pale = srgbToLinear('#9fb3d0')

  // 按星臂强度加权，让亮星臂上也有更多尘埃
  const weightTotal = arms.reduce((s, a) => s + a.strength + 0.08, 0) || 1

  for (let i = 0; i < count; i++) {
    const roll = rand()
    let x = 0
    let y = 0
    let z = 0
    let t = 1
    let dom = -1

    if (roll < 0.84 && arms.length > 0) {
      // 沿星臂
      let pick = rand() * weightTotal
      let arm = arms[0]
      for (const a of arms) {
        pick -= a.strength + 0.08
        if (pick <= 0) {
          arm = a
          break
        }
      }
      const f = rand()
      const at = f * (arm.samples.length - 1)
      const i0 = Math.max(0, Math.min(arm.samples.length - 1, Math.floor(at)))
      const i1 = Math.min(arm.samples.length - 1, i0 + 1)
      const fr = at - i0
      const p = arm.samples[i0]
      const q = arm.samples[i1]
      const cx = p[0] + (q[0] - p[0]) * fr
      const cy = p[1] + (q[1] - p[1]) * fr
      const cz = p[2] + (q[2] - p[2]) * fr
      const tx = q[0] - p[0]
      const tz = q[2] - p[2]
      const tl = Math.hypot(tx, tz) || 1
      const off = gauss() * 0.44
      const lift = gauss() * 0.15 * (1 + 1.5 * Math.exp(-Math.hypot(cx, cz) * 0.5))
      x = cx + (-tz / tl) * off
      y = cy + lift
      z = cz + (tx / tl) * off
      t = arm.tMin + (arm.tMax - arm.tMin) * f
      dom = arm.index
    } else if (roll < 0.96) {
      // 盘面内均匀分布（径向按指数衰减，中心更密）
      const r = Math.pow(rand(), 0.62) * GALAXY.R1 * 1.02
      const a = rand() * Math.PI * 2
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      y = gauss() * 0.12 * (1 + 1.6 * Math.exp(-r * 0.5))
      t = Math.pow(clamp01(r / (GALAXY.R1 * 1.02)), 1 / GALAXY.RADIAL_POW)
    } else {
      // 少数晕族尘埃：让盘外也有极淡的体量
      const u = rand() * 2 - 1
      const a = rand() * Math.PI * 2
      const s = Math.sqrt(Math.max(0, 1 - u * u))
      const r = GALAXY.R1 * (0.9 + rand() * 0.9)
      x = s * Math.cos(a) * r
      y = u * r * 0.55
      z = s * Math.sin(a) * r
      t = 1
    }

    position[i * 3] = x
    position[i * 3 + 1] = y
    position[i * 3 + 2] = z
    size[i] = 0.7 + Math.pow(rand(), 2.2) * 1.9
    seed[i] = rand()
    domain[i] = dom
    time[i] = t
    const pick2 = rand()
    const c = pick2 < 0.24 ? warm : pick2 < 0.8 ? cool : pale
    const dim = 0.55 + rand() * 0.45
    color[i * 3] = c[0] * dim
    color[i * 3 + 1] = c[1] * dim
    color[i * 3 + 2] = c[2] * dim
  }

  return { position, size, seed, color, domain, time, count }
}
