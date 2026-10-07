import { useEffect } from 'react'
import { Universe } from './universe/Universe'
import { Hud } from './ui/Hud'
import { Entry } from './ui/Entry'
import { Composer } from './ui/Composer'
import { Reading } from './ui/Reading'
import { ArchiveSheet } from './ui/ArchiveSheet'
import { HelpSheet } from './ui/HelpSheet'
import { CeremonyOverlay } from './ui/CeremonyOverlay'
import { LivesGallery } from './ui/LivesGallery'
import { AdminPanel } from './ui/admin/AdminPanel'
import { useRoute } from './core/router'
import { flushDraftOnExit, useLife } from './state/store'

export default function App() {
  const hydrate = useLife((s) => s.hydrate)
  const route = useRoute()
  const viewingLife = useLife((s) => s.viewingLife)
  const openLife = useLife((s) => s.openLife)
  const closeLife = useLife((s) => s.closeLife)
  const loadLives = useLife((s) => s.loadLives)
  const refreshSession = useLife((s) => s.refreshSession)
  const hydrated = useLife((s) => s.hydrated)

  useEffect(() => {
    void hydrate()
    // 群星列传是公开数据：一进站就取回来，匿名也能浏览
    void loadLives()
    void refreshSession()
  }, [hydrate, loadLives, refreshSession])

  // 路由与「正在看谁的星空」保持同步：直接打开 /life/xxx 也能正确加载。
  // 必须等本机档案读完 —— 否则 openLife 与 hydrate 会互相覆盖 archive。
  useEffect(() => {
    if (!hydrated) return
    if (route.name === 'life') {
      if (viewingLife?.id !== route.id) void openLife(route.id)
    } else if (route.name === 'sky' && viewingLife) {
      closeLife()
    }
  }, [hydrated, route, viewingLife, openLife, closeLife])

  // 关页面 / 切到后台 / 刷新：草稿再同步落一次盘
  useEffect(() => {
    const flush = () => flushDraftOnExit()
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useLife.getState()
      if (e.key === 'Escape') {
        if (s.ceremony) {
          s.finishCeremony()
          return
        }
        if (s.composerOpen) {
          s.closeComposer()
          return
        }
        if (s.settingsOpen) {
          s.setSettingsOpen(false)
          return
        }
        if (s.helpOpen) {
          s.setHelpOpen(false)
          return
        }
        if (s.reading || s.focusedStarId || s.focusedConstellationId) {
          s.returnCamera()
          return
        }
        return
      }
      const el = e.target as HTMLElement | null
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      if (typing) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'n':
        case 'N':
          s.openComposer()
          break
        case 'o':
        case 'O':
          s.overviewCamera()
          s.openReading({ kind: 'overview', id: 'all' })
          break
        case 't':
        case 'T':
          s.toggleTime()
          break
        case '[':
        case 'ArrowLeft':
          s.setObsTime(s.obsTime - 0.02)
          break
        case ']':
        case 'ArrowRight':
          s.setObsTime(s.obsTime + 0.02)
          break
        case 'Home':
          s.resetObsTime()
          break
        case ' ':
          // ★ 空格 = 播放/暂停，必须**全局**可用。
          //   原来它只挂在时间轴元素的 onKeyDown 上（那是给 role="slider" 的无障碍操作），
          //   于是「空格播放/暂停」得先用鼠标点一下时间轴才生效 —— 与承诺不符。
          //   时间轴那个处理器会 stopPropagation，所以聚焦在轴上时不会触发两次。
          e.preventDefault()
          s.toggleObsPlay()
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 撤掉进入前的舞台（纯深色渐变，避免白屏）
  useEffect(() => {
    const gate = document.getElementById('xinglv-gate')
    if (!gate) return
    const t = window.setTimeout(() => {
      gate.classList.add('is-gone')
      window.setTimeout(() => gate.remove(), 1400)
    }, 260)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <div className="xinglv-stage">
      <Universe />
      <div className="xinglv-overlay">
        {route.name === 'lives' ? (
          <LivesGallery />
        ) : route.name === 'admin' ? (
          <AdminPanel />
        ) : (
          <>
            <Hud />
            <Reading />
            <Composer />
            <ArchiveSheet />
            <HelpSheet />
            <Entry />
            <CeremonyOverlay />
          </>
        )}
      </div>
    </div>
  )
}
