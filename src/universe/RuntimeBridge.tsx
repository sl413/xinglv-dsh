import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { clamp01, frameStep, smoothstep } from '../core/math'
import { GALAXY, domainFocusIndexOf } from '../core/layout'
import { runtime } from './runtime'
import { useLife } from '../state/store'
import { cameraDirector } from './camera/CameraRig'

/**
 * 运行时桥 + 沉浸式启动编舞
 * ---------------------------------------------------------------------------
 * 启动绝不允许「白屏 + 巨大 Loading」。星履的启动是一场有顺序的降临：
 *
 *   0.0s  只有深空与极暗的银河 —— 宇宙先存在
 *   0.6s  极远恒星陆续亮起
 *   2.0s  中距离星云浮现，结构慢慢清晰
 *   3.0s  宇宙尘埃开始可见
 *   3.6s  人生星按时间顺序被依次点亮 —— 相当于用几秒钟重看一遍自己走过的路
 *   4.2s  近景微粒出现
 *   5.6s  星轨开始生长
 *   同时  镜头从很远的地方极慢地推近，并轻微环绕
 *
 * 所有进度都写进 GPU uniform，不经过 React state，所以启动期间不会掉帧。
 */

const BOOT_TOTAL = 8.2
const BOOT_TOTAL_EMPTY = 4.6

/**
 * 自动播放：1× 时用多少秒走完整个时间跨度。
 * ---------------------------------------------------------------------------
 * 用「全程时长」而不是「每秒多少年」当基准，是因为它对任何档案都成立：
 * 无论一个人的记录横跨 8 年还是 70 年，1× 都是「用 30 秒把这一生重看一遍」。
 * 界面上会把倍率换算成真实的年/秒与剩余时长显示出来，不让用户猜。
 */
const PLAY_SPAN_SECONDS = 30
/** 写回 store 的间隔：视觉平滑由下面那层指数逼近负责，这里只要跟上即可 */
const PLAY_WRITE_INTERVAL = 0.08

export function RuntimeBridge() {
  const playClock = useRef(0)

  useFrame((state, dtRaw) => {
    // 真实帧间隔驱动编舞；只有从后台切回来时的大跳才丢弃
    const dt = frameStep(dtRaw)
    runtime.time += dt
    runtime.dt = dt
    runtime.pixelRatio = state.gl.getPixelRatio()
    runtime.width = state.size.width
    runtime.height = state.size.height

    const store = useLife.getState()

    // ---------------------------------------------------------- 自动播放
    // 每帧推进「目标观测时刻」，但只在每 80ms 写回一次 store。
    // 这样做的好处：React 不会每帧重渲染（时间轴、星数读数都是 React 组件），
    // 而画面依然完全平滑 —— 因为 runtime.obs 每帧都在向目标做指数逼近，
    // 中间的过程由 GPU 侧的插值补上。
    if (store.obsPlaying) {
      playClock.current += dt * store.obsSpeed
      if (playClock.current >= PLAY_WRITE_INTERVAL) {
        const step = playClock.current / PLAY_SPAN_SECONDS
        playClock.current = 0
        const next = store.obsTime + step
        if (next >= 1) {
          store.setObsTime(1)
          store.setObsPlaying(false) // 走到最后就停；再按播放会从头开始
        } else {
          store.setObsTime(next)
        }
      }
    } else {
      playClock.current = 0
    }

    // 观测时间做极短平滑：时间旅行应该像一次真实的位移，而不是一个滑块
    const targetObs = useLife.getState().obsTime
    if (Math.abs(targetObs - runtime.obs) < 0.0004) {
      runtime.obs = targetObs
    } else {
      runtime.obs += (targetObs - runtime.obs) * (1 - Math.exp(-dt / 0.055))
    }

    // ------------------------------------------------------------ 启动
    const empty = store.archive.achievements.length === 0
    const total = empty ? BOOT_TOTAL_EMPTY : BOOT_TOTAL
    const t = Math.max(0, performance.now() / 1000 - store.bootStartedAt)
    const k = t / total

    const shellBoot = 0.28 + 0.72 * smoothstep(0.0, 0.3, k)
    const starsBoot = smoothstep(0.06, 0.42, k)
    const nebulaBoot = smoothstep(0.24, 0.6, k)
    const dustBoot = smoothstep(0.34, 0.66, k)
    const lifeBoot = smoothstep(0.42, 0.88, k) * 1.34
    const trailBoot = smoothstep(0.66, 0.95, k)
    const moteBoot = smoothstep(0.48, 0.86, k)

    runtime.boot = clamp01(k)

    runtime.set('deepShell', 'uBoot', shellBoot)
    runtime.set('deepStars', 'uBoot', starsBoot)
    runtime.set('nebula', 'uBoot', nebulaBoot)
    runtime.set('midDust', 'uBoot', dustBoot)
    runtime.set('galaxyDisk', 'uBoot', Math.min(1, nebulaBoot * 1.15))
    runtime.set('galaxyPuffs', 'uBoot', Math.min(1, nebulaBoot * 1.2))
    runtime.set('galaxyDust', 'uBoot', Math.min(1, dustBoot * 1.1))
    runtime.set('lifeStars', 'uBoot', lifeBoot)
    runtime.set('starDust', 'uBoot', lifeBoot)
    runtime.set('starCore', 'uBoot', lifeBoot)
    runtime.set('nearMotes', 'uBoot', moteBoot)
    for (const trail of store.universe.trails) {
      runtime.set(trail.id, 'uBoot', trailBoot)
    }

    // 领域高亮：一处写、所有图层响应
    runtime.broadcast('uDomainFocus', domainFocusIndexOf(store.universe, store.domainFocus))

    // 启动时的镜头：从很远的地方推近
    if (k < 1.02 && store.phase !== 'loading') {
      const e = k < 1 ? 1 - Math.pow(1 - Math.min(1, k), 3) : 1
      const start = cameraDirector.homeRadius * (empty ? 1.7 : 2.5)
      cameraDirector.desired.radius = start + (cameraDirector.homeRadius - start) * e
      cameraDirector.desired.theta = GALAXY.HOME_THETA - 0.55 * (1 - e)
      cameraDirector.desired.phi = GALAXY.HOME_PHI + 0.22 * (1 - e)
    }
    if (k >= 1 && store.phase !== 'ready') {
      store.setPhase('ready')
    } else if (k > 0.2 && store.phase === 'loading') {
      // 深空已经出现，界面可以开始浮现（但人生星还在依次点亮）
      store.setPhase('entering')
    }

    runtime.syncFrame()
  })

  return null
}
