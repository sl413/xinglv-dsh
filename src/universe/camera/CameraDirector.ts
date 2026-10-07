import * as THREE from 'three'
import { GALAXY } from '../../core/layout'
import { clamp, clamp01, frameStep, smoothstep, velocityProfileEasing } from '../../core/math'

/**
 * 星履 · 统一 Camera Director
 * ---------------------------------------------------------------------------
 * 全应用只有这一个地方能动相机。它的职责不是「转一转让用户看」，而是编排：
 *
 *   自由漫游：带阻尼与惯性的球面环绕，拖动即跟手，松手有余势，滚轮/双指对数缩放。
 *   聚焦飞行：停顿 → 平滑加速 → 弧线飞行（同时视线先看向前方、再转向目标）
 *             → 穿越星尘 → 减速 → 焦点变化（视场收窄）→ 景深缓缓进入。
 *   返回：沿一条更短的弧线回到进入前的相机位置、观察方向、缩放层级与上下文。
 *
 * 加速/巡航/减速的比例由一条速度包络积分得到（velocityProfileEasing），
 * 而不是套一个对称的 ease —— 这是镜头「有重量」的关键。
 */

export type DirectorPhase = 'free' | 'hold' | 'fly' | 'settle' | 'focused' | 'returning' | 'glide'

export interface FreeState {
  tx: number
  ty: number
  tz: number
  radius: number
  theta: number
  phi: number
  fov: number
}

export interface DirectorContext {
  phase: DirectorPhase
  /** 正在注视的目标（世界坐标） */
  look: THREE.Vector3
  /** 当前聚焦的星体位置（无则为 null） */
  focus: THREE.Vector3 | null
  /** 穿越星尘的强度 */
  whoosh: number
  /** 到注视焦点的距离，供景深使用 */
  focusDistance: number
  /** 散景强度 */
  bokeh: number
}

export class CameraDirector {
  /* 自由相机。字段要显式标 number：GALAXY 是 as const，
     直接赋值会把字面量类型（0.82、15.2）推断进字段，之后就赋不进别的值了。 */
  target = new THREE.Vector3(0, 0, 0)
  radius: number = GALAXY.HOME_DIST
  theta: number = GALAXY.HOME_THETA
  phi: number = GALAXY.HOME_PHI
  fov = 52

  phase: DirectorPhase = 'free'
  homeRadius: number = GALAXY.HOME_DIST

  desired: { radius: number; theta: number; phi: number; tx: number; ty: number; tz: number } = {
    radius: GALAXY.HOME_DIST,
    theta: GALAXY.HOME_THETA,
    phi: GALAXY.HOME_PHI,
    tx: 0,
    ty: 0,
    tz: 0,
  }
  private vel = { theta: 0, phi: 0 }
  private panVel = new THREE.Vector3()
  private dragging = false
  private snapshot: FreeState | null = null
  private preScrubRadius: number | null = null

  private look = new THREE.Vector3()
  private focusPos: THREE.Vector3 | null = null
  private whoosh = 0
  private bokeh = 0

  private flight: {
    curve: THREE.CatmullRomCurve3
    ease: (t: number) => number
    hold: number
    duration: number
    elapsed: number
    fovFrom: number
    fovTo: number
    lookTo: THREE.Vector3
    depth: boolean
  } | null = null

  private settleElapsed = 0
  private settleDuration = 1.1
  private settleDepth = false

  private returnFlight: {
    curve: THREE.CatmullRomCurve3
    ease: (t: number) => number
    duration: number
    elapsed: number
    lookTo: THREE.Vector3
    target: FreeState
  } | null = null

  private tmpA = new THREE.Vector3()
  private tmpB = new THREE.Vector3()
  private tmpC = new THREE.Vector3()

  constructor() {
    this.look.set(0, 0, 0)
  }

  /* ------------------------------------------------------------- 状态导出 */

  context(): DirectorContext {
    return {
      phase: this.phase,
      look: this.look,
      focus: this.focusPos,
      whoosh: this.whoosh,
      focusDistance: this.focusPos ? this.currentDistanceTo(this.focusPos) : this.radius,
      bokeh: this.bokeh,
    }
  }

  private currentDistanceTo(p: THREE.Vector3): number {
    return this.sphericalPosition(this.tmpA).distanceTo(p)
  }

  private sphericalPosition(out: THREE.Vector3): THREE.Vector3 {
    const sp = Math.sin(this.phi)
    out.set(
      this.target.x + this.radius * sp * Math.cos(this.theta),
      this.target.y + this.radius * Math.cos(this.phi),
      this.target.z + this.radius * sp * Math.sin(this.theta),
    )
    return out
  }

  private freeState(): FreeState {
    return {
      tx: this.target.x,
      ty: this.target.y,
      tz: this.target.z,
      radius: this.radius,
      theta: this.theta,
      phi: this.phi,
      fov: this.fov,
    }
  }

  private applyState(s: FreeState): void {
    this.target.set(s.tx, s.ty, s.tz)
    this.radius = s.radius
    this.theta = s.theta
    this.phi = s.phi
    this.fov = s.fov
    this.desired.radius = s.radius
    this.desired.theta = s.theta
    this.desired.phi = s.phi
    this.desired.tx = s.tx
    this.desired.ty = s.ty
    this.desired.tz = s.tz
    this.vel.theta = 0
    this.vel.phi = 0
  }

  /**
   * 「一整片星河」需要多远的机位。
   * 人生星河的盘面是扁的，所以按**水平**视场取景（竖屏时自动退回到按宽度贴合），
   * 否则在宽屏上会退得太远，星河缩成画面正中一小团。
   */
  frameDistance(extent: number, aspect: number, margin = 0.86): number {
    const tanV = Math.tan((this.fov * Math.PI) / 360)
    const tanH = tanV * clamp(aspect, 0.42, 1.78)
    return clamp((extent * margin) / Math.max(0.0001, tanH), 5.5, 130)
  }

  /** 让人生的星河刚好放进画面（以人生星的重心为中心，而不是原点） */
  setHome(extent: number, aspect: number, center?: [number, number, number]): void {
    const dist = this.frameDistance(extent, aspect, 0.86)
    this.homeRadius = dist
    if (this.phase === 'free') {
      this.desired.radius = dist
      this.desired.phi = GALAXY.HOME_PHI
      this.desired.theta = 1.58
      if (center) {
        this.desired.tx = center[0]
        this.desired.ty = center[1]
        this.desired.tz = center[2]
      }
    }
  }

  /* --------------------------------------------------------------- 输入 */

  beginDrag(): void {
    this.dragging = true
    this.vel.theta = 0
    this.vel.phi = 0
  }

  endDrag(): void {
    this.dragging = false
  }

  orbitBy(dxPx: number, dyPx: number, dt: number): void {
    const sens = 0.0034
    const dTheta = -dxPx * sens
    const dPhi = -dyPx * sens
    if (this.phase === 'free' || this.phase === 'focused' || this.phase === 'glide') {
      this.phase = this.focusPos ? 'focused' : 'free'
      this.desired.theta += dTheta
      this.desired.phi = clamp(this.desired.phi + dPhi, 0.12, Math.PI - 0.12)
      if (dt > 0.0001) {
        this.vel.theta = dTheta / dt
        this.vel.phi = dPhi / dt
      }
    }
  }

  panBy(dxPx: number, dyPx: number, viewportH: number): void {
    const scale = (this.radius * 0.0016 * (viewportH / 900)) / Math.max(0.4, Math.sin(this.phi))
    const right = this.tmpA.set(Math.cos(this.theta + Math.PI / 2), 0, Math.sin(this.theta + Math.PI / 2))
    const up = this.tmpB.set(0, 1, 0)
    const move = this.tmpC.copy(right).multiplyScalar(-dxPx * scale).addScaledVector(up, dyPx * scale)
    this.desired.tx += move.x
    this.desired.ty += move.y
    this.desired.tz += move.z
    const lim = 40
    this.desired.tx = clamp(this.desired.tx, -lim, lim)
    this.desired.ty = clamp(this.desired.ty, -lim, lim)
    this.desired.tz = clamp(this.desired.tz, -lim, lim)
    this.panVel.copy(move)
  }

  zoomBy(wheelDelta: number): void {
    const factor = Math.exp(wheelDelta * 0.00115)
    this.desired.radius = clamp(this.desired.radius * factor, 2.0, 130)
  }

  zoomByPinch(scale: number): void {
    this.desired.radius = clamp(this.desired.radius / Math.max(0.2, scale), 2.0, 130)
  }

  /** 时间回溯时，整个星空会往里收，所以相机也顺势靠近一点，让构图始终成立 */
  setObs(t: number): void {
    if (t < 0.999) {
      if (this.preScrubRadius == null) this.preScrubRadius = this.desired.radius
      this.desired.radius = clamp(this.preScrubRadius * (0.5 + 0.5 * t), 2.4, 130)
    } else if (this.preScrubRadius != null) {
      this.desired.radius = this.preScrubRadius
      this.preScrubRadius = null
    }
  }

  /* --------------------------------------------------------------- 取景 */

  focusOn(
    position: THREE.Vector3,
    framing: number,
    opts?: { depth?: boolean; close?: boolean; standoff?: number },
  ): void {
    if (this.phase === 'returning') return
    if (!this.snapshot) this.snapshot = this.freeState()
    const camPos = this.sphericalPosition(new THREE.Vector3())
    const dir = camPos.clone().sub(position)
    if (dir.lengthSq() < 1e-6) dir.set(0.35, 0.32, 0.6)
    dir.normalize()
    // 抵达时略微抬高视线，别让星体压在星盘正中
    dir.y += 0.12
    dir.normalize()

    const fovRad = (this.fov * Math.PI) / 180
    const standoff = clamp(opts?.standoff ?? (framing * 2.6) / Math.tan(fovRad / 2), 1.7, opts?.close ? 300 : 22)
    const finalPos = position.clone().addScaledVector(dir, standoff)

    const D = camPos.distanceTo(finalPos)

    // ---------------------------------------------------------------- 掠过盘面
    // 飞行不再走「直线抬高」的路径，而是**沿盘面切向掠过去**：
    // 在柱坐标里让方位角走完大部分行程、半径先撑到盘面外圈、高度贴着盘面。
    // 这样星臂与尘埃会从身边流过 —— 把 2~5 秒的「等待」变成「穿行」。
    //
    // 三个刻意的取法：
    //   · 方位角走**最短路**（否则会绕远半圈，显得毫无理由）；
    //   · 半径中段撑到巡航半径（不低于 R1×0.7）—— 免得路径从核球里穿过去，那会白茫茫一片；
    //   · 高度只抬一点点（D×0.05，最多 1.4）—— 抬太高就变成「俯瞰一张地图」，
    //     而掠过的手感要求盘面**在眼睛的高度上**流过。近场气体由 uNear 负责淡出，不会糊屏。
    const cyl = (p: THREE.Vector3) => ({ r: Math.hypot(p.x, p.z), th: Math.atan2(p.z, p.x), y: p.y })
    const sc = cyl(camPos)
    const ec = cyl(finalPos)
    let dTh = ec.th - sc.th
    dTh = Math.atan2(Math.sin(dTh), Math.cos(dTh)) // 归一到 [-π, π]：走最短路
    const cruiseR = Math.max(sc.r, ec.r, GALAXY.R1 * 0.7)
    const lift = clamp(D * 0.05, 0.2, 1.4)

    const at = (k: number): THREE.Vector3 => {
      // 方位角：用 smoothstep 在整段行程里持续转，中段最快
      const th = sc.th + dTh * smoothstep(0.04, 0.96, k)
      // 半径：两端是真实端点，中段被撑到巡航半径
      const blendR = sc.r + (ec.r - sc.r) * k
      const r = blendR + (cruiseR - blendR) * Math.sin(Math.PI * k) * 0.85
      // 高度：贴着盘面走，只留一点抬升
      const y = sc.y + (ec.y - sc.y) * smoothstep(0.0, 1.0, k) + lift * Math.sin(Math.PI * k)
      return new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r)
    }

    const curve = new THREE.CatmullRomCurve3(
      [camPos.clone(), at(0.16), at(0.38), at(0.62), at(0.84), finalPos.clone()],
      false,
      'centripetal',
      0.5,
    )

    const depth = opts?.depth ?? true
    this.flight = {
      curve,
      ease: velocityProfileEasing(0.26, 0.34),
      // 只是让点击「落定」一下，几乎立刻起飞 —— 空等会让整个过渡显得生硬
      hold: 0.12,
      duration: clamp(1.8 + D * 0.072, 2.1, 4.8),
      elapsed: 0,
      fovFrom: this.fov,
      fovTo: this.fov - 3.4,
      lookTo: position.clone(),
      depth,
    }
    this.focusPos = position.clone()
    this.bokeh = 0
    this.phase = 'hold'
    this.settleDepth = depth
  }

  /** 新星诞生：镜头先飞到刚点亮的位置旁边 */
  ceremonyApproach(position: THREE.Vector3): void {
    if (!this.snapshot) this.snapshot = this.freeState()
    // 站位要够远，才看得见星尘从 7.5 单位外被引力卷进来
    this.focusOn(position, 1, { depth: false, close: true, standoff: 8.6 })
    if (this.flight) this.flight.duration = clamp(this.flight.duration * 0.72, 1.8, 3.2)
    this.settleDuration = 0.5
  }

  /** 仪式最后：缓慢拉远，让人看见它已经成为自己星河的一部分 */
  ceremonyPullback(extent: number, aspect: number, center?: [number, number, number]): void {
    this.focusPos = null
    this.settleDepth = false
    this.returnToSnapshotInternal(this.frameDistance(extent, aspect, 1.26), 3.6, true, center)
  }

  returnToSnapshot(): void {
    this.returnToSnapshotInternal(null, 0, false)
  }

  private returnToSnapshotInternal(
    radiusOverride: number | null,
    durationOverride: number,
    keepSnapshot: boolean,
    center?: [number, number, number],
  ): void {
    const snap = this.snapshot
    const camPos = this.sphericalPosition(new THREE.Vector3())
    if (!snap && radiusOverride == null) {
      this.phase = 'free'
      this.focusPos = null
      return
    }
    const target: FreeState = snap
      ? { ...snap }
      : { ...this.freeState(), radius: radiusOverride ?? this.radius, phi: GALAXY.HOME_PHI, theta: GALAXY.HOME_THETA, tx: 0, ty: 0, tz: 0 }
    if (center) {
      target.tx = center[0]
      target.ty = center[1]
      target.tz = center[2]
    }
    const finalRadius = radiusOverride ?? target.radius

    // 由目标自由状态反推终点位置
    const sp = Math.sin(target.phi)
    const finalPos = new THREE.Vector3(
      target.tx + finalRadius * sp * Math.cos(target.theta),
      target.ty + finalRadius * Math.cos(target.phi),
      target.tz + finalRadius * sp * Math.sin(target.theta),
    )
    const D = camPos.distanceTo(finalPos)
    const up = new THREE.Vector3(0, 1, 0)
    const forward = finalPos.clone().sub(camPos)
    if (forward.lengthSq() < 1e-8) {
      this.applyState({ ...target, radius: finalRadius })
      this.phase = 'free'
      this.focusPos = null
      if (!keepSnapshot) this.snapshot = null
      return
    }
    forward.normalize()
    const side = new THREE.Vector3().crossVectors(forward, up).normalize()
    const lift = clamp(D * 0.2, 0.5, 5.2)
    const w1 = camPos.clone().addScaledVector(up, lift * 0.7)
    const w2 = camPos.clone().lerp(finalPos, 0.55).addScaledVector(up, lift).addScaledVector(side, D * 0.05)
    const curve = new THREE.CatmullRomCurve3([camPos.clone(), w1, w2, finalPos.clone()], false, 'centripetal', 0.5)
    this.returnFlight = {
      curve,
      ease: velocityProfileEasing(0.24, 0.4),
      duration: durationOverride > 0 ? durationOverride : clamp(1.5 + D * 0.055, 1.7, 3.6),
      elapsed: 0,
      lookTo: new THREE.Vector3(target.tx, target.ty, target.tz),
      target: { ...target, radius: finalRadius },
    }
    this.focusPos = null
    this.bokeh = 0
    this.phase = 'returning'
    if (!keepSnapshot) this.snapshot = null
  }

  /** 平滑滑到「一整片星河」的构图（不覆盖返回快照） */
  toOverview(extent: number, aspect: number, center?: [number, number, number], keepSnapshot = false): void {
    if (!keepSnapshot) {
      this.snapshot = null
      this.focusPos = null
    }
    this.phase = 'glide'
    this.desired.tx = center ? center[0] : 0
    this.desired.ty = center ? center[1] : 0
    this.desired.tz = center ? center[2] : 0
    this.desired.radius = this.frameDistance(extent, aspect, 0.95)
    this.desired.phi = GALAXY.HOME_PHI
  }

  /* --------------------------------------------------------------- 每帧 */

  update(dt: number, camera: THREE.PerspectiveCamera): DirectorContext {
    // 用真实帧间隔推进动画：低端设备上跑到 1fps 也不会把镜头拖成慢动作；
    // 只有「从后台切回来」那种几秒级的大跳才丢弃（见 frameStep）。
    const step = frameStep(dt)
    this.whoosh = 0

    if (this.phase === 'hold' || this.phase === 'fly') {
      this.updateFlight(step, camera)
    } else if (this.phase === 'settle') {
      this.updateSettle(step, camera)
    } else if (this.phase === 'returning') {
      this.updateReturn(step, camera)
    } else {
      this.updateFree(step, camera)
    }

    // 景深：只有真正聚焦到一颗星时才进入，飞行途中保持全清晰
    const targetBokeh = this.phase === 'settle' || this.phase === 'focused' ? (this.settleDepth ? 1.8 : 0) : 0
    this.bokeh += (targetBokeh - this.bokeh) * Math.min(1, step / 0.5)
    return this.context()
  }

  private updateFree(step: number, camera: THREE.PerspectiveCamera): void {
    // 惯性
    if (!this.dragging) {
      const decay = Math.exp(-step / 0.3)
      this.desired.theta += this.vel.theta * step
      this.desired.phi = clamp(this.desired.phi + this.vel.phi * step, 0.12, Math.PI - 0.12)
      this.vel.theta *= decay
      this.vel.phi *= decay
      if (Math.abs(this.vel.theta) < 1e-4) this.vel.theta = 0
      if (Math.abs(this.vel.phi) < 1e-4) this.vel.phi = 0
    }

    const slow = this.phase === 'glide'
    const tauAngle = slow ? 0.55 : 0.085
    const tauRadius = slow ? 0.7 : 0.17
    const tauTarget = slow ? 0.6 : 0.12
    const kA = 1 - Math.exp(-step / tauAngle)
    const kR = 1 - Math.exp(-step / tauRadius)
    const kT = 1 - Math.exp(-step / tauTarget)

    this.theta += (this.desired.theta - this.theta) * kA
    this.phi += (this.desired.phi - this.phi) * kA
    this.radius += (this.desired.radius - this.radius) * kR
    this.target.x += (this.desired.tx - this.target.x) * kT
    this.target.y += (this.desired.ty - this.target.y) * kT
    this.target.z += (this.desired.tz - this.target.z) * kT

    if (slow && Math.abs(this.desired.radius - this.radius) < 0.05 && Math.abs(this.desired.theta - this.theta) < 0.01) {
      this.phase = 'free'
    }

    const pos = this.sphericalPosition(this.tmpA)
    camera.position.copy(pos)
    const look = this.tmpB.copy(this.target)
    if (slow) {
      // 滑向全景时，先看星河中心，再落到目标
      look.set(0, 0, 0)
    }
    this.look.lerp(look, 1 - Math.exp(-step / 0.2))
    camera.lookAt(this.look)
    this.setFov(camera, this.fov)
  }

  private updateFlight(step: number, camera: THREE.PerspectiveCamera): void {
    const f = this.flight
    if (!f) {
      this.phase = 'free'
      return
    }
    f.elapsed += step
    if (f.elapsed < f.hold) {
      // 停顿：什么都不做，给观众一个「他要看那颗星了」的预告
      this.phase = 'hold'
      const pos = this.sphericalPosition(this.tmpA)
      camera.position.copy(pos)
      this.look.lerp(f.lookTo, 1 - Math.exp(-step / 0.45))
      camera.lookAt(this.look)
      this.setFov(camera, f.fovFrom)
      return
    }
    this.phase = 'fly'
    const raw = clamp01((f.elapsed - f.hold) / f.duration)
    const e = f.ease(raw)
    const p = f.curve.getPointAt(clamp01(e))
    const tangent = f.curve.getTangentAt(clamp01(e))
    camera.position.copy(p)

    // 视线：先看向飞行前方，再逐渐转向目标星
    const lead = 0.7 + 3.0 * (1 - e)
    const ahead = this.tmpC.copy(p).addScaledVector(tangent, lead)
    const align = smoothstep(0.32, 0.95, e)
    ahead.lerp(f.lookTo, align * align)
    this.look.lerp(ahead, 1 - Math.exp(-step / 0.13))
    camera.lookAt(this.look)

    // 视场：巡航时略微张开（速度感），抵达时收窄（焦点变化）
    const fovNow = f.fovFrom + 4.6 * Math.sin(Math.PI * e) - (f.fovFrom - f.fovTo) * smoothstep(0.55, 1, e)
    this.setFov(camera, fovNow)

    this.whoosh = Math.sin(Math.PI * clamp01((raw - 0.1) / 0.72))

    if (raw >= 1) {
      this.flight = null
      this.phase = 'settle'
      this.settleElapsed = 0
      this.settleDuration = 1.1
      // 抵达后把自由环绕的中心搬到这颗星上 —— 用户可以绕着它转
      if (this.focusPos) this.target.copy(this.focusPos)
      this.desired.tx = this.target.x
      this.desired.ty = this.target.y
      this.desired.tz = this.target.z
      const rel = this.tmpA.copy(camera.position).sub(this.target)
      this.radius = Math.max(1.4, rel.length())
      this.desired.radius = this.radius
      this.phi = Math.acos(clamp(rel.y / this.radius, -1, 1))
      this.theta = Math.atan2(rel.z, rel.x)
      this.desired.phi = this.phi
      this.desired.theta = this.theta
      this.fov = f.fovTo
    }
  }

  private updateSettle(step: number, camera: THREE.PerspectiveCamera): void {
    this.settleElapsed += step
    // 极轻微的公转，让画面「活着」而不是一张截图
    this.desired.theta += 0.006 * step
    this.desired.radius += 0.05 * step
    this.theta += (this.desired.theta - this.theta) * Math.min(1, step / 0.5)
    this.phi += (this.desired.phi - this.phi) * Math.min(1, step / 0.5)
    this.radius += (this.desired.radius - this.radius) * Math.min(1, step / 0.6)
    const pos = this.sphericalPosition(this.tmpA)
    camera.position.copy(pos)
    this.look.lerp(this.target, 1 - Math.exp(-step / 0.35))
    camera.lookAt(this.look)
    this.setFov(camera, this.fov)
    if (this.settleElapsed >= this.settleDuration) {
      this.phase = 'focused'
      this.bokeh = this.settleDepth ? 2.4 : 0
    }
  }

  private updateReturn(step: number, camera: THREE.PerspectiveCamera): void {
    const r = this.returnFlight
    if (!r) {
      this.phase = 'free'
      return
    }
    r.elapsed += step
    const raw = clamp01(r.elapsed / r.duration)
    const e = r.ease(raw)
    const p = r.curve.getPointAt(clamp01(e))
    camera.position.copy(p)
    const targetLook = this.tmpC.copy(r.lookTo)
    this.look.lerp(targetLook, 1 - Math.exp(-step / 0.2))
    camera.lookAt(this.look)
    this.setFov(camera, this.fov + (r.target.fov - this.fov) * e)
    this.whoosh = 0.55 * Math.sin(Math.PI * raw)

    if (raw >= 1) {
      this.applyState(r.target)
      this.returnFlight = null
      this.phase = 'free'
      this.bokeh = 0
      // 精确落到快照位置，避免累积误差
      const pos = this.sphericalPosition(this.tmpA)
      camera.position.copy(pos)
      this.look.copy(this.target)
      camera.lookAt(this.look)
      this.setFov(camera, this.fov)
    }
  }

  private setFov(camera: THREE.PerspectiveCamera, fov: number): void {
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov
      camera.updateProjectionMatrix()
    }
  }
}
