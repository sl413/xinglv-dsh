import * as THREE from 'three'

/**
 * 星履 · 渲染运行时
 * ---------------------------------------------------------------------------
 * 三层之间的联动（启动仪式、新星诞生、时间回溯、镜头景深、悬停高亮）
 * 需要每帧写进几十个 uniform。如果走 React state，一帧就是几十次重渲染，
 * 手感会立刻垮掉。所以这里维护一个**可变的运行时对象**：
 *   · 每个图层把自己的 ShaderMaterial 注册进来；
 *   · 跨图层的编舞（BootDirector / NovaCeremony / CameraDirector）直接写 uniform；
 *   · React 只负责把 store 里的少数事实同步进来（RuntimeBridge）。
 */

export interface CeremonyRuntime {
  starId: string
  index: number
  position: THREE.Vector3
  /** 仪式已经进行的秒数 */
  t: number
  /** 与该星相关的既有星轨（要生长出来） */
  trailIds: string[]
}

/** 每帧投影出来的星座标注位置（供 DOM 层直接写样式，不触发 React 重渲染） */
export interface ProjectedLabel {
  id: string
  x: number
  y: number
  alpha: number
}

class Runtime {
  /** 累计时间（秒） */
  time = 0
  dt = 0
  /** 启动仪式进度：0 → 1（1.2 表示人生星全部点亮完毕） */
  boot = 0
  /** 观测时间 0..1 */
  obs = 1
  /** 仪式期间对「其他星」的整体压暗，1 = 正常 */
  dim = 1
  /** 穿越星尘的瞬时强度 0..1 */
  whoosh = 0

  hoverIndex = -1
  selectedIndex = -1
  pressedIndex = -1

  /** 当前相机到注视点的距离（世界单位），驱动景深 */
  focusDistance = 24
  /** 散景强度 */
  bokeh = 0
  /** 泛光强度倍率 */
  bloom = 1

  quality: 'high' | 'balanced' | 'low' = 'high'
  pixelRatio = 1
  width = 1
  height = 1

  ceremony: CeremonyRuntime | null = null

  /** 人生星座的屏幕标注（由 ConstellationProjector 每几帧写一次） */
  projected: ProjectedLabel[] = []

  private materials = new Map<string, THREE.ShaderMaterial>()

  register(key: string, mat: THREE.ShaderMaterial): void {
    this.materials.set(key, mat)
    // 注册时补齐通用 uniform，避免第一帧差一帧的闪烁
    this.syncOne(mat)
  }

  unregister(key: string): void {
    this.materials.delete(key)
  }

  material(key: string): THREE.ShaderMaterial | undefined {
    return this.materials.get(key)
  }

  /** 把所有材质里存在的同名 uniform 写一遍 */
  broadcast(name: string, value: number): void {
    for (const mat of this.materials.values()) {
      const u = mat.uniforms?.[name]
      if (u) u.value = value
    }
  }

  set(key: string, name: string, value: unknown): void {
    const mat = this.materials.get(key)
    if (!mat) return
    const u = mat.uniforms?.[name]
    if (u) u.value = value
  }

  /** 每帧统一同步时间类 uniform */
  syncFrame(): void {
    for (const mat of this.materials.values()) this.syncOne(mat)
  }

  private syncOne(mat: THREE.ShaderMaterial): void {
    const u = mat.uniforms
    if (!u) return
    if (u.uTime) u.uTime.value = this.time
    if (u.uObs) u.uObs.value = this.obs
    if (u.uDim) u.uDim.value = this.dim
    if (u.uWhoosh) u.uWhoosh.value = this.whoosh
    if (u.uPixelRatio) u.uPixelRatio.value = this.pixelRatio
  }
}

export const runtime = new Runtime()

/** 相机默认站位（与 GALAXY.HOME_* 对齐，但相机自己也要有一份可读的常量） */
export const HOME_RADIUS = 19.5
