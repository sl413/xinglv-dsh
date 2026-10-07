import * as THREE from 'three'
import { GALAXY, armAngleAt } from '../core/layout'
import { cameraDirector } from '../universe/camera/CameraRig'
import { runtime } from '../universe/runtime'
import { useLife } from '../state/store'

/**
 * 验收桥（QA bridge）
 * ---------------------------------------------------------------------------
 * 只在地址栏带 ?qa 时安装，默认完全不存在的只读探针。
 * 它存在的理由很实际：无头浏览器没法「凭肉眼」找到一颗星在哪，
 * 而星履的拾取半径是随星体大小和距离变化的（12~72px），
 * 靠盲点网格去撞既慢又不可靠。这里把「星在屏幕上的位置」如实报出来，
 * 验收脚本再派发**真实**的指针事件去点它 —— 走的仍然是用户的输入路径。
 *
 * 除了一处便捷入口（focus，等价于点击一颗星），其余全是只读的。
 */

interface QaCamera {
  camera: THREE.PerspectiveCamera
  width: number
  height: number
  left: number
  top: number
}

let mounted: QaCamera | null = null
let probeFn: (() => Record<string, unknown>) | null = null

export function setQaCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  left = 0,
  top = 0,
): void {
  mounted = { camera, width, height, left, top }
}

/** 相机与输入装置的内部读数（用于诊断「点击有没有真的到达应用」） */
export function setQaProbe(fn: (() => Record<string, unknown>) | null): void {
  probeFn = fn
}

const tmp = new THREE.Vector3()

export function installQaBridge(): void {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)
  if (!params.has('qa')) return

  const api = {
    /** 当前每一颗人生星在屏幕上的位置（与拾取使用同一套投影） */
    starScreenXY() {
      const { universe, obsTime } = useLife.getState()
      const cam = mounted
      if (!cam) return []
      const out: Array<{
        id: string
        title: string
        domain: string
        x: number
        y: number
        glow: number
        radius: number
        t: number
      }> = []
      const tanHalf = Math.tan((cam.camera.fov * Math.PI) / 360)
      for (const s of universe.stars) {
        if (s.time > obsTime + 0.012) continue
        tmp.set(s.position[0], s.position[1], s.position[2])
        const viewZ = tmp.clone().applyMatrix4(cam.camera.matrixWorldInverse).z
        if (viewZ > -0.35) continue
        tmp.project(cam.camera)
        const x = cam.left + (tmp.x * 0.5 + 0.5) * cam.width
        const y = cam.top + (-tmp.y * 0.5 + 0.5) * cam.height
        if (x < 4 || y < 4 || x > cam.left + cam.width - 4 || y > cam.top + cam.height - 4) continue
        const pxPerWorld = cam.height * 0.5 / (tanHalf * Math.max(0.4, -viewZ))
        out.push({
          id: s.id,
          title: s.achievement.title,
          domain: s.domain,
          x,
          y,
          glow: s.glow,
          radius: Math.max(12, Math.min(72, s.glow * pxPerWorld * 1.18)),
          t: s.time,
        })
      }
      return out
    },
    /** 把屏幕点换成拾取结果（验证拾取半径是否真的合理） */
    pickAt(x: number, y: number) {
      const cam = mounted
      if (!cam) return null
      const { universe, obsTime } = useLife.getState()
      return pickProbe(cam, universe, obsTime, x, y)
    },
    state() {
      const s = useLife.getState()
      return {
        phase: s.phase,
        entered: s.entered,
        obsTime: Number(s.obsTime.toFixed(4)),
      obsPlaying: s.obsPlaying,
      frameOriginMs: s.universe.frame.originMs,
      frameEndMs: s.universe.frame.endMs,
      obsSpeed: s.obsSpeed,
        total: s.archive.achievements.length,
        journeys: s.archive.journeys.length,
        storageMode: s.storageMode,
        status: s.status,
        quality: s.quality,
        ceremony: s.ceremony ? { starId: s.ceremony.starId, token: s.ceremony.token } : null,
        reading: s.reading,
        focusedStarId: s.focusedStarId,
        draftRestored: s.draftRestored,
        draftLength: s.draft.title.length + s.draft.reflection.length,
        timeOpen: s.timeOpen,
        lastSavedAt: s.lastSavedAt,
        probe: probeFn ? probeFn() : null,
      }
    },
    /** 只读：每颗人生星的世界坐标（验收用来看空间分布，例如星臂有没有被铺满） */
    starWorld() {
      const { universe } = useLife.getState()
      return universe.stars.map((s) => ({
        id: s.id,
        domain: s.domain,
        time: s.time,
        x: s.position[0],
        y: s.position[1],
        z: s.position[2],
      }))
    },
    /** 只读：每一道星臂的中心线角度（与布局用的是同一套公式） */
    armAngles() {
      const out: number[] = []
      for (let i = 0; i < 10; i++) out.push(armAngleAt(i))
      return out
    },
    /** 只读：盘面几何常数，便于验收脚本自己换算 */
    galaxyConstants() {
      return { R0: GALAXY.R0, R1: GALAXY.R1, WIND: GALAXY.WIND, ARMS: 10 }
    },
    /** 载入示例星河（等价于点进入页的「先看看一片示例星河」，用于验收示例的进退） */
    loadSample() {
      return useLife.getState().loadSample()
    },
    /** 「回到我自己的星空」（等价于点顶部横幅上的那个按钮） */
    restoreMySky() {
      return useLife.getState().restoreMySky()
    },
    /** 只读：人生星材质里那两个「交互反馈」uniform 的实际取值（-1 表示没接上） */
    lifeStarCues() {
      const mat = runtime.material('lifeStars')
      if (!mat) return null
      return {
        hover: Number(mat.uniforms.uHover?.value ?? -999),
        selected: Number(mat.uniforms.uSelected?.value ?? -999),
      }
    },
    /** 等价于鼠标划过一颗星（验收 hover 反馈用） */
    hover(id: string | null) {
      useLife.getState().hoverStar(id)
    },
    /** 等价于用户点开一颗星（同一套 store 动作） */
    focus(id: string) {
      useLife.getState().focusStar(id)
    },
    /**
     * 只读：镜头当前状态。
     * 转场/飞行轨迹的验收要靠**按时间采样它**，而不是截图 ——
     * 无头环境里连续截图拿到的 WebGL 帧可能是同一帧（实测连拍 6 张完全一致），
     * 但镜头状态是每帧真在变的。
     */
    camera() {
      const cam = mounted
      const pos = cam ? cam.camera.position : null
      const d = cameraDirector
      const ctx = d.context()
      return {
        phase: d.phase,
        x: pos ? Number(pos.x.toFixed(3)) : 0,
        y: pos ? Number(pos.y.toFixed(3)) : 0,
        z: pos ? Number(pos.z.toFixed(3)) : 0,
        r: pos ? Number(Math.hypot(pos.x, pos.z).toFixed(3)) : 0,
        theta: pos ? Number(Math.atan2(pos.z, pos.x).toFixed(4)) : 0,
        fov: cam ? Number(cam.camera.fov.toFixed(3)) : 0,
        // whoosh 是私有的，走公开的 context() 读 —— 不为验收单独开一个口子
        whoosh: Number(ctx.whoosh.toFixed(3)),
      }
    },
    /** 只读：一颗星在屏幕上的位置（判断目标星有没有被跟住） */
    starXY(id: string) {
      const list = (this as unknown as { starScreenXY: () => Array<{ id: string; x: number; y: number }> }).starScreenXY()
      for (const s of list) if (s.id === id) return { x: s.x, y: s.y }
      return null
    },
    /** 导出：与「档案 → 导出到文件」走同一条路径 */
    exportText() {
      return useLife.getState().exportText()
    },
    /** 导入：与「档案 → 从文件导入」走同一条路径 */
    importText(text: string, strategy: 'merge' | 'replace' = 'merge') {
      return useLife.getState().importArchive(text, strategy)
    },
    /** 时间轴：与拖动右侧轨道等效 */
    setObs(t: number) {
      useLife.getState().setObsTime(t)
    },
  }

  Object.defineProperty(window, '__XINGLV_QA__', { value: api, configurable: true })
}

/** 与 CameraRig 相同的解析式拾取：这里单独调一次用于断言 */
function pickProbe(
  cam: QaCamera,
  universe: ReturnType<typeof useLife.getState>['universe'],
  obsTime: number,
  x: number,
  y: number,
): { id: string; title: string; score: number } | null {
  let best: { id: string; title: string; score: number } | null = null
  const tanHalf = Math.tan((cam.camera.fov * Math.PI) / 360)
  for (const s of universe.stars) {
    if (s.time > obsTime + 0.012) continue
    tmp.set(s.position[0], s.position[1], s.position[2])
    const viewZ = tmp.clone().applyMatrix4(cam.camera.matrixWorldInverse).z
    if (viewZ > -0.35) continue
    tmp.project(cam.camera)
    const sx = cam.left + (tmp.x * 0.5 + 0.5) * cam.width
    const sy = cam.top + (-tmp.y * 0.5 + 0.5) * cam.height
    const d = Math.hypot(sx - x, sy - y)
    const pxPerWorld = cam.height * 0.5 / (tanHalf * Math.max(0.4, -viewZ))
    const radius = Math.max(12, Math.min(72, s.glow * pxPerWorld * 1.18))
    if (d > radius) continue
    const score = d / radius
    if (!best || score < best.score) best = { id: s.id, title: s.achievement.title, score }
  }
  return best
}
