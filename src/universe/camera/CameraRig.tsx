import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CameraDirector } from './CameraDirector'
import { pickAt } from './picking'
import { cameraBus } from '../../state/bus'
import { useLife } from '../../state/store'
import { runtime } from '../runtime'
import { universeExtent } from '../../core/layout'
import { setQaCamera, setQaProbe } from '../../qa/bridge'

/**
 * 相机装置：把「用户的意图」翻译成导演的指令，并把精细的输入手感做在这里。
 *
 * 手感的几条硬规则：
 *   · 严格区分点击与拖动：位移 < 6px 且 < 340ms 才算点击。
 *   · Hover 只轻微增强光芒，绝不改变镜头。
 *   · 按下有克制的反馈（星体轻微收缩），确定点击之后才执行镜头聚焦。
 *   · 移动端单指旋转、双指缩放与平移，并且双指期间不产生点击。
 */

export const cameraDirector = new CameraDirector()

const CLICK_MOVE_TOLERANCE = 6
const CLICK_TIME_LIMIT = 340

/** 诊断：最近一次指针抬起时，点击判定到底看到了什么（仅经 QA 探针读取） */
let lastPointer: Record<string, unknown> | null = null

interface PointerInfo {
  id: number
  x: number
  y: number
  startX: number
  startY: number
  startTime: number
  moved: boolean
  button: number
}

export function CameraRig() {
  const gl = useThree((s) => s.gl)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const universe = useLife((s) => s.universe)
  const homeSet = useRef(false)
  const extentRef = useRef(12)
  /** 上一次的导演阶段：用来在「飞行结束」这一个瞬间发一次抵达信号 */
  const lastPhase = useRef<string>('free')

  const stateRef = useRef({
    pointers: new Map<number, PointerInfo>(),
    pinchDist: 0,
    pinchMid: { x: 0, y: 0 },
    dragging: false,
    lastMoveAt: 0,
    hoverAt: 0,
    lastHoverId: null as string | null,
  })

  useEffect(() => {
    const extent = universeExtent(universe)
    extentRef.current = extent
    if (!homeSet.current && universe.stars.length > 0) {
      cameraDirector.setHome(extent, size.width / Math.max(1, size.height), universe.center)
      homeSet.current = true
    }
  }, [universe, size.width, size.height])

  /* ------------------------------------------------------------ 输入装置 */

  useEffect(() => {
    setQaProbe(() => ({
      directorPhase: cameraDirector.phase,
      hoverIndex: runtime.hoverIndex,
      pressedIndex: runtime.pressedIndex,
      selectedIndex: runtime.selectedIndex,
      whoosh: Number(runtime.whoosh.toFixed(3)),
      obs: Number(runtime.obs.toFixed(4)),
      camera: [camera.position.x, camera.position.y, camera.position.z].map((v) => Number(v.toFixed(2))),
      fov: Number(camera.fov.toFixed(2)),
      radius: Number(cameraDirector.radius.toFixed(2)),
      pointerCount: stateRef.current.pointers.size,
      dragging: stateRef.current.dragging,
      hoveredId: useLife.getState().hoveredId,
      lastPointer,
    }))
    return () => setQaProbe(null)
  }, [camera])

  useEffect(() => {
    const el = gl.domElement
    el.style.touchAction = 'none'
    el.style.cursor = 'grab'
    el.style.userSelect = 'none'
    const st = stateRef.current

    const rect = () => el.getBoundingClientRect()

    const pick = (clientX: number, clientY: number, hover: boolean, starOnly = false) => {
      const u = useLife.getState().universe
      return pickAt(clientX, clientY, rect(), camera, u, {
        obs: useLife.getState().obsTime,
        hover,
        starOnly,
      })
    }

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return
      try {
        el.setPointerCapture?.(e.pointerId)
      } catch {
        /* 合成事件或已释放的指针：忽略即可，不影响拖动 */
      }
      st.pointers.set(e.pointerId, {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        // 用事件自身的时间戳，而不是处理函数被调用的时刻：
        // 主线程卡一下的时候，用户真实的快速点击不该被误判成拖动。
        startTime: e.timeStamp,
        moved: false,
        button: e.button,
      })
      if (st.pointers.size === 1) {
        cameraDirector.beginDrag()
        st.dragging = false
        el.style.cursor = 'grabbing'
        const hit = pick(e.clientX, e.clientY, false, true)
        runtime.pressedIndex = hit ? hit.index : -1
      } else if (st.pointers.size === 2) {
        const [a, b] = [...st.pointers.values()]
        st.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        st.pinchMid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        // 双指期间绝不产生点击
        for (const info of st.pointers.values()) info.moved = true
        runtime.pressedIndex = -1
      }
    }

    const onPointerMove = (e: PointerEvent) => {
      const info = st.pointers.get(e.pointerId)
      const now = performance.now()
      if (!info) {
        // 纯 hover
        if (now - st.hoverAt < 55) return
        st.hoverAt = now
        const hit = pick(e.clientX, e.clientY, true)
        const id = hit?.kind === 'star' ? hit.id : null
        runtime.hoverIndex = hit?.kind === 'star' ? hit.index : -1
        if (id !== st.lastHoverId) {
          st.lastHoverId = id
          useLife.getState().hoverStar(id)
        }
        el.style.cursor = hit ? 'pointer' : 'grab'
        return
      }

      const dx = e.clientX - info.x
      const dy = e.clientY - info.y
      info.x = e.clientX
      info.y = e.clientY
      const total = Math.hypot(e.clientX - info.startX, e.clientY - info.startY)
      if (total > CLICK_MOVE_TOLERANCE) {
        info.moved = true
        st.dragging = true
      }
      const dt = Math.max(0.001, (now - st.lastMoveAt) / 1000)
      st.lastMoveAt = now
      if (!info.moved) return

      if (st.pointers.size >= 2) {
        const [a, b] = [...st.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
        if (st.pinchDist > 8) {
          cameraDirector.zoomByPinch(dist / st.pinchDist)
          cameraDirector.panBy(mid.x - st.pinchMid.x, mid.y - st.pinchMid.y, size.height)
        }
        st.pinchDist = dist
        st.pinchMid = mid
        return
      }

      if (info.button === 2) {
        cameraDirector.panBy(dx, dy, size.height)
      } else {
        cameraDirector.orbitBy(dx, dy, dt)
      }
      runtime.hoverIndex = -1
      if (st.lastHoverId !== null) {
        st.lastHoverId = null
        useLife.getState().hoverStar(null)
      }
    }

    const endPointer = (e: PointerEvent) => {
      const info = st.pointers.get(e.pointerId)
      st.pointers.delete(e.pointerId)
      if (!info) {
        lastPointer = { stage: 'no-info', pointerId: e.pointerId, type: e.type }
        return
      }
      const wasSingle = st.pointers.size === 0
      const dt = e.timeStamp - info.startTime
      if (wasSingle) {
        cameraDirector.endDrag()
        st.dragging = false
        runtime.pressedIndex = -1
        el.style.cursor = 'grab'
      }
      if (st.pointers.size === 0) st.pinchDist = 0

      // 点击判定：位移小、时间短、且不是双指过程
      if (!info.moved && dt < CLICK_TIME_LIMIT && info.id === e.pointerId) {
        const store = useLife.getState()
        if (store.ceremony) return
        const hit = pick(e.clientX, e.clientY, false)
        lastPointer = {
          stage: 'click',
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
          dt: Math.round(dt),
          moved: info.moved,
          hitKind: hit?.kind ?? null,
          hitId: hit?.id ?? null,
          hitScore: hit ? Number(hit.score.toFixed(3)) : null,
        }
        if (hit?.kind === 'star') {
          store.focusStar(hit.id)
        } else if (hit?.kind === 'constellation') {
          store.focusConstellation(hit.id)
        } else if (store.reading || store.focusedStarId || store.focusedConstellationId) {
          store.returnCamera()
        }
      } else {
        lastPointer = {
          stage: 'rejected',
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
          dt: Math.round(dt),
          moved: info.moved,
          idMatch: info.id === e.pointerId,
        }
      }
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY
      cameraDirector.zoomBy(delta)
    }

    const onContext = (e: Event) => e.preventDefault()
    const onDouble = (e: MouseEvent) => {
      const hit = pick(e.clientX, e.clientY, false)
      if (!hit) useLife.getState().overviewCamera()
    }
    const onPointerLeave = () => {
      runtime.hoverIndex = -1
      if (st.lastHoverId !== null) {
        st.lastHoverId = null
        useLife.getState().hoverStar(null)
      }
    }

    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    el.addEventListener('pointerleave', onPointerLeave)
    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('contextmenu', onContext)
    el.addEventListener('dblclick', onDouble)

    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
      el.removeEventListener('pointerleave', onPointerLeave)
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('contextmenu', onContext)
      el.removeEventListener('dblclick', onDouble)
    }
  }, [gl, camera, size.height])

  /* -------------------------------------------------------------- 每帧 */

  useFrame((_, dt) => {
    const store = useLife.getState()
    const u = store.universe
    const extent = universeExtent(u)
    const aspect = size.width / Math.max(1, size.height)

    for (const cmd of cameraBus.drain()) {
      switch (cmd.kind) {
        case 'focusStar': {
          const idx = u.byId.get(cmd.id)
          if (idx == null) break
          const s = u.stars[idx]
          // 站位由星体大小决定但设了下限：小的星也要推到能看清结构的距离，
          // 大的星则自然更远一点，于是「重要程度 → 视觉分量」始终成立。
          const standoff = Math.min(6.5, Math.max(2.0, 0.9 + s.glow * 6))
          cameraDirector.focusOn(
            new THREE.Vector3(s.position[0], s.position[1], s.position[2]),
            s.glow * 3.6,
            { depth: true, standoff },
          )
          break
        }
        case 'focusConstellation': {
          const c = u.constellations.find((x) => x.id === cmd.id)
          if (!c) break
          cameraDirector.focusOn(new THREE.Vector3(c.centroid[0], c.centroid[1], c.centroid[2]), Math.max(0.9, c.radius * 1.25), { depth: true })
          break
        }
        case 'overview':
          cameraDirector.toOverview(extent, aspect, u.center)
          break
        case 'returnHome':
          cameraDirector.returnToSnapshot()
          break
        case 'ceremonyDepart': {
          const idx = u.byId.get(cmd.starId)
          if (idx == null) break
          const s = u.stars[idx]
          cameraDirector.ceremonyApproach(new THREE.Vector3(s.position[0], s.position[1], s.position[2]))
          break
        }
        case 'ceremonyPullback':
          cameraDirector.ceremonyPullback(extent, aspect, u.center)
          break
        case 'timeDrift':
          cameraDirector.setObs(cmd.t)
          break
      }
    }

    const ctx = cameraDirector.update(dt, camera)
    runtime.whoosh = ctx.whoosh
    runtime.focusDistance = ctx.focusDistance
    runtime.bokeh = ctx.bokeh
    setQaCamera(camera, size.width, size.height)

    if (ctx.focus) {
      const idx = u.byId.get(store.focusedStarId ?? '')
      runtime.selectedIndex = idx ?? -1
    } else {
      runtime.selectedIndex = -1
    }

    // 抵达信号：飞行一结束（进入 settle）就告诉 store 一次。
    // 故事面板据此才浮现 —— 于是「镜头抵达」和「字浮上来」是同一件事，
    // 而不是点下去就先弹一块面板干等三秒。
    const phase = cameraDirector.phase
    if (phase !== lastPhase.current) {
      if ((phase === 'settle' || phase === 'focused') && lastPhase.current === 'fly') {
        store.cameraArrived()
      }
      lastPhase.current = phase
    }
  })

  return null
}
