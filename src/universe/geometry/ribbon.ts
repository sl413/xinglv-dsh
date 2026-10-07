import * as THREE from 'three'

/**
 * 星轨 ribbon 的公共几何与材质。
 * 星轨（成长路径）与新星诞生时临时生长的「微光轨迹」共用同一套实现，
 * 因此两者在视觉上是同一种东西 —— 这很重要：新生的那一刻，
 * 它接入的是你原本就有的那种光。
 */

export const RIBBON_VERTEX = /* glsl */ `
  attribute vec3 aTangent;
  attribute float aSide;
  attribute float aAlong;
  attribute float aTime;
  uniform float uWidth;
  varying float vSide;
  varying float vAlong;
  varying float vTime;
  void main() {
    vec3 center = position;
    vec3 toCam = cameraPosition - center;
    float dist = max(length(toCam), 0.0001);
    vec3 view = toCam / dist;
    vec3 side = cross(aTangent, view);
    float sl = length(side);
    side = sl > 0.0005 ? side / sl : vec3(0.0, 1.0, 0.0);
    float w = uWidth * max(0.42, dist * 0.05);
    vec3 p = center + side * aSide * w;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    vSide = aSide;
    vAlong = aAlong;
    vTime = aTime;
  }
`

export const RIBBON_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uObs;
  uniform float uDim;
  uniform float uGrow;
  uniform float uOpacity;
  uniform float uStrength;
  varying float vSide;
  varying float vAlong;
  varying float vTime;
  void main() {
    float e = 1.0 - abs(vSide);
    if (e <= 0.0) discard;
    // 横截面收得更快：不是一根画出来的线，而是一道很薄的光
    float soft = pow(e, 2.1);
    float pulse = 0.7 + 0.3 * sin((vAlong * 3.0 - uTime * 0.14) * 6.28318);
    // 沿轨道断成柔软的光节，避免读成一条实线
    float dash = 0.24 + 0.76 * smoothstep(0.22, 0.78, sin(vAlong * 52.0 - uTime * 0.45) * 0.5 + 0.5);
    // 两端自然淡出
    float ends = smoothstep(0.0, 0.14, vAlong) * (1.0 - smoothstep(0.86, 1.0, vAlong));
    float grow = smoothstep(vAlong - 0.07, vAlong + 0.015, uGrow);
    float visible = 1.0 - smoothstep(uObs - 0.01, uObs + 0.05, vTime);
    float head = smoothstep(0.82, 1.0, vAlong);
    float a = soft * pulse * dash * ends * grow * visible * uOpacity * uDim * (0.45 + 0.55 * head);
    vec3 col = uColor * (1.0 + 0.4 * head);
    gl_FragColor = vec4(col * a * uStrength, 1.0);
  }
`

export interface RibbonPath {
  points: [number, number, number][]
  tangents: [number, number, number][]
  times: number[]
}

/** Catmull-Rom 采样：把几个控制点变成一条柔软、可细分的光轨 */
export function samplePath(control: [number, number, number][], per = 12, timeAt?: number[]): RibbonPath {
  const pts = control
  if (pts.length < 2) return { points: [], tangents: [], times: [] }
  const outP: [number, number, number][] = []
  const outT: number[] = []
  const segs = pts.length - 1
  for (let s = 0; s < segs; s++) {
    const p0 = pts[Math.max(0, s - 1)]
    const p1 = pts[s]
    const p2 = pts[s + 1]
    const p3 = pts[Math.min(pts.length - 1, s + 2)]
    const last = s === segs - 1
    const steps = last ? per : per - 1
    for (let i = 0; i <= steps; i++) {
      const t = i / per
      const t2 = t * t
      const t3 = t2 * t
      const p: [number, number, number] = [0, 0, 0]
      for (let k = 0; k < 3; k++) {
        p[k] =
          0.5 *
          (2 * p1[k] +
            (-p0[k] + p2[k]) * t +
            (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
            (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
      }
      outP.push(p)
      const tt = timeAt ? timeAt[Math.min(timeAt.length - 1, Math.round((s + t) / segs * (timeAt.length - 1)))] : (s + t) / segs
      outT.push(tt)
    }
  }
  const tangents: [number, number, number][] = []
  for (let i = 0; i < outP.length; i++) {
    const a = outP[Math.max(0, i - 1)]
    const b = outP[Math.min(outP.length - 1, i + 1)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const dz = b[2] - a[2]
    const len = Math.hypot(dx, dy, dz) || 1
    tangents.push([dx / len, dy / len, dz / len])
  }
  const t0 = outT[0] ?? 0
  const t1 = outT[outT.length - 1] ?? 1
  const span = t1 - t0 || 1
  return { points: outP, tangents, times: outT.map((x) => Math.min(1, Math.max(0, (x - t0) / span))) }
}

export function buildRibbon(path: RibbonPath): THREE.BufferGeometry {
  const n = path.points.length
  const positions = new Float32Array(Math.max(1, n * 2) * 3)
  const tangents = new Float32Array(Math.max(1, n * 2) * 3)
  const side = new Float32Array(Math.max(1, n * 2))
  const along = new Float32Array(Math.max(1, n * 2))
  const times = new Float32Array(Math.max(1, n * 2))
  const indices: number[] = []
  for (let i = 0; i < n; i++) {
    const a = i * 2
    const b = i * 2 + 1
    for (let k = 0; k < 3; k++) {
      positions[a * 3 + k] = path.points[i][k]
      positions[b * 3 + k] = path.points[i][k]
      tangents[a * 3 + k] = path.tangents[i][k]
      tangents[b * 3 + k] = path.tangents[i][k]
    }
    side[a] = -1
    side[b] = 1
    const t = n > 1 ? i / (n - 1) : 0
    along[a] = t
    along[b] = t
    times[a] = path.times[i] ?? 1
    times[b] = path.times[i] ?? 1
  }
  for (let i = 0; i < n - 1; i++) {
    const a = i * 2
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  g.setAttribute('aTangent', new THREE.BufferAttribute(tangents, 3))
  g.setAttribute('aSide', new THREE.BufferAttribute(side, 1))
  g.setAttribute('aAlong', new THREE.BufferAttribute(along, 1))
  g.setAttribute('aTime', new THREE.BufferAttribute(times, 1))
  g.setIndex(indices)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40)
  return g
}

export function createRibbonMaterial(opts: {
  color: [number, number, number]
  width: number
  grow?: number
  strength?: number
  opacity?: number
}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uObs: { value: 1 },
      uBoot: { value: 1 },
      uDim: { value: 1 },
      uWhoosh: { value: 0 },
      uPixelRatio: { value: 1 },
      uColor: { value: new THREE.Vector3(opts.color[0], opts.color[1], opts.color[2]) },
      uWidth: { value: opts.width },
      uGrow: { value: opts.grow ?? 1 },
      uStrength: { value: opts.strength ?? 0.5 },
      uOpacity: { value: opts.opacity ?? 1 },
    },
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  })
}
