import { useEffect, useRef, useState } from 'react'
import { domainDef } from '../core/domains'
import { navigate, useRoute } from '../core/router'
import { STATIC_SITE } from '../core/buildMode'
import { isSampleArchive } from '../core/sample'
import { formatAgo } from '../core/types'
import { useLife } from '../state/store'
import { Timeline } from './Timeline'
import { DomainLegend } from './DomainLegend'

/**
 * 首页的界面骨架
 * ---------------------------------------------------------------------------
 * 界面必须比星空安静：没有数值面板、没有任务条、没有成就弹窗。
 * 这里只有品牌、三个入口、一处统计、一条时间轴、一句会自己消失的引导语，
 * 以及鼠标停在一颗星上时跟着光出现的一行字。
 */

/* ------------------------------------------------------------------ 图标 */

function IconPath() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M4 4v9a5 5 0 0 0 5 5h11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="4" cy="4" r="1.6" fill="currentColor" />
    </svg>
  )
}

function IconDomain() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconGear() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M12 3.5v2.2M12 18.3v2.2M4.8 7.6l1.9 1.1M17.3 15.3l1.9 1.1M4.8 16.4l1.9-1.1M17.3 8.7l1.9-1.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconFrame() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M4 9V5.6A1.6 1.6 0 0 1 5.6 4H9M15 4h3.4A1.6 1.6 0 0 1 20 5.6V9M20 15v3.4A1.6 1.6 0 0 1 18.4 20H15M9 20H5.6A1.6 1.6 0 0 1 4 18.4V15"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

function IconEye() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

/** 管理入口的钥匙图标 */
function IconKey() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="8" cy="12" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11.4 12H21M17.6 12v3M20 12v2.2" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function IconGuest() {  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <circle cx="12" cy="8.4" r="3.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M5.4 19.4c.9-3.2 3.5-4.9 6.6-4.9s5.7 1.7 6.6 4.9" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function IconTrail() {  return (
    <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden>
      <path
        d="M3 16c3-6 6 3 9-3s6 3 9-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="3 3.4"
      />
    </svg>
  )
}

function LogoMark() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden className="brand-mark">
      <path d="M16 2.5c.6 5.9 2.4 9.6 12.6 13.5C18.4 19.9 16.6 23.6 16 29.5c-.6-5.9-2.4-9.6-12.6-13.5C13.6 12.1 15.4 8.4 16 2.5Z" fill="currentColor" opacity="0.92" />
    </svg>
  )
}

/* ------------------------------------------------------------------ 主体 */

export function Hud() {
  const phase = useLife((s) => s.phase)
  const entered = useLife((s) => s.entered)
  const ceremony = useLife((s) => s.ceremony)
  const openComposer = useLife((s) => s.openComposer)
  const composerOpen = useLife((s) => s.composerOpen)
  const reading = useLife((s) => s.reading)
  const openReading = useLife((s) => s.openReading)
  const settingsOpen = useLife((s) => s.settingsOpen)
  const setSettingsOpen = useLife((s) => s.setSettingsOpen)
  const domainOpen = useLife((s) => s.domainOpen)
  const setDomainOpen = useLife((s) => s.setDomainOpen)
  const domainFocus = useLife((s) => s.domainFocus)
  const trailsVisible = useLife((s) => s.trailsVisible)
  const toggleTrails = useLife((s) => s.toggleTrails)
  const universe = useLife((s) => s.universe)
  const archive = useLife((s) => s.archive)
  const restoreMySky = useLife((s) => s.restoreMySky)
  const status = useLife((s) => s.status)
  const storageMode = useLife((s) => s.storageMode)
  const notice = useLife((s) => s.notice)
  const dismissNotice = useLife((s) => s.dismissNotice)
  // ★ 撤销入口原来只长在「故事面板」底部（Reading.tsx 的 .undo-bar），
  //   而删掉一颗星后面板就关了 —— 删掉最后一颗星时那个按钮根本不存在，
  //   可提示条的文案却写着「可以点下面的「撤销」找回来」。这里让它兑现承诺。
  const lastDeleted = useLife((s) => s.lastDeleted)
  const undoLastDelete = useLife((s) => s.undoLastDelete)
  const retryArchive = useLife((s) => s.retryArchive)
  const overviewCamera = useLife((s) => s.overviewCamera)
  const returnCamera = useLife((s) => s.returnCamera)
  const focusedStarId = useLife((s) => s.focusedStarId)
  const focusedConstellationId = useLife((s) => s.focusedConstellationId)
  const hoveredId = useLife((s) => s.hoveredId)
  const viewingLife = useLife((s) => s.viewingLife)
  const closeLife = useLife((s) => s.closeLife)
  const admin = useLife((s) => s.admin)
  const route = useRoute()
  

  const [quiet, setQuiet] = useState(false)
  const [showWhisper, setShowWhisper] = useState(true)
  const tipRef = useRef<HTMLDivElement>(null)
  const tipPos = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const t1 = window.setTimeout(() => setQuiet(true), 11000)
    // 引导语只留很短一会儿：星空的常态应该是干净的，一个字都没有
    const t2 = window.setTimeout(() => setShowWhisper(false), 8000)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [])

  // 悬停提示直接改 DOM 位置：跟随鼠标不该引起任何 React 重渲染
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      tipPos.current = { x: e.clientX, y: e.clientY }
      const el = tipRef.current
      if (el) {
        el.style.left = `${Math.min(e.clientX, window.innerWidth - 300)}px`
        el.style.top = `${e.clientY}px`
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  useEffect(() => {
    if (!notice || notice.kind === 'error') return
    const t = window.setTimeout(() => dismissNotice(), 6500)
    return () => window.clearTimeout(t)
  }, [notice, dismissNotice])

  const stats = universe.stats
  const hoveredStar = hoveredId != null ? universe.stars[universe.byId.get(hoveredId) ?? -1] : undefined
  // 入口页承担「第一次来」的全部界面；除此之外骨架都该在
  const entryShowing = !entered && stats.total === 0 && phase !== 'loading'
  const faded = phase === 'loading' || !!ceremony || entryShowing
  // 记录停在很久以前的档案（例如群星列传里的历史人物）不该说「至今／此刻」。
  // 用最后一条记录的年份判断：frame.endMs 带构图余量，长跨度下会误判。
  const historical = (stats.lastMs ?? 0) < Date.now() - 2 * 365 * 86400000
  const isSample = isSampleArchive(archive)
  const focused = !!focusedStarId || !!focusedConstellationId
  const spanYears = stats.spanYears

  return (
    <>
      {/* 品牌 */}
      <div className={`brand${quiet ? ' is-quiet' : ''}`} style={{ opacity: faded ? 0 : undefined }}>
        <LogoMark />
        <div className="brand-text">
          <div className="brand-title">星履</div>
          <div className="brand-sub">XINGLV</div>
        </div>
      </div>

      {/* 顶栏 */}
      <div className="topbar" style={{ opacity: faded ? 0 : 1, pointerEvents: faded ? 'none' : 'auto' }}>
        <button
          className={`top-btn${reading?.kind === 'path' ? ' is-on' : ''}`}
          onClick={() => openReading(reading?.kind === 'path' ? null : { kind: 'path', id: 'all' })}
        >
          <IconPath />
          来时路
        </button>
        <button
          className={`top-btn${domainOpen || domainFocus ? ' is-on' : ''}`}
          onClick={() => setDomainOpen(!domainOpen)}
          title={domainFocus ? '已经高亮一个领域 · 点开看是哪一条路' : '人生领域'}
        >
          {domainFocus ? (
            <span className="top-domain-dot" style={{ background: domainDef(domainFocus).color }} />
          ) : (
            <IconDomain />
          )}
          人生领域
          <span className="caret">▾</span>
        </button>
        <button
          className={`top-btn${route.name === 'lives' || viewingLife ? ' is-on' : ''}`}
          onClick={() => navigate({ name: 'lives' })}
          title="群星列传 · 看别人走过的路"
        >
          <IconGuest />
          群星列传
        </button>
        {/* 纯静态托管（GitHub Pages）没有服务器，管理端必然登录不上 —— 索性不显示 */}
        {admin && !STATIC_SITE ? (
          <button
            className={`top-btn${route.name === 'admin' ? ' is-on' : ''}`}
            onClick={() => navigate({ name: 'admin' })}
            title="管理名人库（只有站长能进）"
          >
            <IconKey />
            管理
          </button>
        ) : null}
        <button className={`top-icon${settingsOpen ? ' is-on' : ''}`} onClick={() => setSettingsOpen(!settingsOpen)} title="档案">
          <IconGear />
        </button>
      </div>

      {/* 看某位人物的星空时的横幅：提醒这不是你的星空，也给一个可以直接分享的地址 */}
      {viewingLife ? (
        <div className="guest-bar" style={{ opacity: faded ? 0 : 1 }}>
          <div className="gb-main">
            <span className={`gb-badge${viewingLife.fictional ? ' is-fictional' : ''}`}>
              {viewingLife.fictional ? '虚构人物' : '群星列传'}
            </span>
            <span className="gb-name">{viewingLife.name}</span>
            <span className="gb-span">{lifeSpan(viewingLife.birthYear, viewingLife.deathYear)}</span>
          </div>
          <div className="gb-note">
            {viewingLife.fictional
              ? // ★ 虚构人物的横幅说明必须来自人物自己，不能写死。
                //   原来这里硬编码着「为感受规模而生成」—— 那是给一千条规模演示人物写的，
                //   一旦库里出现第二个虚构人物（例如小说角色），这句话就变成了错的。
                (viewingLife.id === 'demo-thousand'
                  ? '为感受规模而生成 · 不是史料 · 请勿引用'
                  : '虚构人物 · 不是史料 · 请勿引用')
              : '公开史料 · 年份级 · 未逐条核对 · 不代表评价'}
          </div>
          <button className="ghost-btn" onClick={() => copyShareLink(viewingLife.id)} title="复制这一页的网址">
            复制链接
          </button>
          <button className="ghost-btn" onClick={() => navigate({ name: 'lives' })}>
            全部人物
          </button>
          <button
            className="ghost-btn"
            onClick={() => {
              navigate({ name: 'sky' })
              closeLife()
            }}
          >
            回到我的星空
          </button>
        </div>
      ) : null}

      {/* 左侧信息 */}
      <div className="info-col" style={{ opacity: faded ? 0 : 1 }}>
        {viewingLife ? (
          <>
            <div className="badge">
              群星列传
              <span>只读参观</span>
            </div>
            <div className="tagline">{viewingLife.summary}</div>
          </>
        ) : (
          <>
            {isSample ? (
              <div className="badge sample-badge">
                <span className="sb-text">
                  示例星空
                  <span>仅供体验 · 不是你自己的记录</span>
                </span>
                <button
                  className="sb-return"
                  style={{ pointerEvents: 'auto' }}
                  onClick={() => {
                    void restoreMySky()
                  }}
                >
                  回到我的星空
                </button>
              </div>
            ) : null}
            <div className="tagline">让走过的每一步，都在星空中留下光。</div>
          </>
        )}
        <div className="stat-chips">
          <span>
            <b>{stats.total}</b> 颗星
          </span>
          <span>
            <b>{stats.journeyCount}</b> 段旅程
          </span>
          <span>
            <b>{stats.constellationCount}</b> 个星座
          </span>
        </div>
      </div>

      {/* 右侧浮动工具：星空里一个字都不落，所以星座入口放在面板里 */}
      <div className="side-tools" style={{ opacity: faded ? 0 : 1, pointerEvents: faded ? 'none' : 'auto' }}>
        <button className="round-btn" onClick={overviewCamera} title="回到整片星河">
          <IconFrame />
        </button>
        <button
          className={`round-btn${trailsVisible ? '' : ' is-off'}`}
          onClick={toggleTrails}
          title={trailsVisible ? '隐藏星轨' : '显示星轨'}
        >
          <IconTrail />
        </button>
        <button
          className="round-btn"
          onClick={() => {
            overviewCamera()
            openReading({ kind: 'overview', id: 'all' })
          }}
          title="星河概览 · 星座与统计（不在星空里显示文字）"
        >
          <IconEye />
        </button>
      </div>

      {/* 底部左 */}
      <div className="footer-left" style={{ opacity: faded ? 0 : 1 }}>
        <div className="fl-count">
          <span className={`dot${storageMode === 'memory' ? ' is-rose' : status === 'saved' ? ' is-amber' : ''}`} />
          {isSample ? `${stats.total} 颗示例星` : `${stats.total} 颗星`}
          {spanYears >= 1 ? (
            <span className="fl-sub">
              {' · '}
              {viewingLife
                ? lifeSpan(viewingLife.birthYear, viewingLife.deathYear)
                : historical
                  ? `${yearOf(stats.firstMs)}–${yearOf(stats.lastMs)}`
                  : `${spanYears.toFixed(0)} 年 · 从 ${yearOf(stats.firstMs)} 至今`}
            </span>
          ) : null}
        </div>
        <div className="fl-hint">拖动探索 · 滚动靠近</div>
      </div>

      {/* 底部右：只有在自己的星空里才有「点亮一颗星」 */}
      <div className="footer-right" style={{ opacity: faded ? 0 : 1, pointerEvents: faded ? 'none' : 'auto' }}>
        {focused ? (
          <button className="ghost-btn" onClick={returnCamera}>
            回到星河
          </button>
        ) : null}
        {viewingLife ? (
          <button
            className="ghost-btn"
            onClick={() => {
              navigate({ name: 'lives' })
              closeLife()
            }}
          >
            回到群星列传
          </button>
        ) : (
          <button className="light-btn" onClick={openComposer}>
            点亮一颗星
          </button>
        )}
      </div>

      <Timeline />
      <DomainLegend />

      {showWhisper && !faded && !composerOpen && !reading ? (
        <div className="whisper">拖动环绕这片星河 · 滚轮远近 · 点击一颗星，读它的故事</div>
      ) : null}

      {/* 状态与提示 */}
      {/* ★ aria-live：这条产品的铁律之一是「数据没存住就必须说没存住」，
          而对读屏用户来说，之前这里是**完全静默**的 —— 提示条不会被播报。
          错误用 alert（打断式），其余用 status（polite）。 */}
      <div className="notice-stack" role="status" aria-live="polite" style={{ opacity: faded ? 0 : 1 }}>
        {status === 'unsaved' ? (
          <div className="status-note" role="alert">
            <strong>有一颗星还没有安全归档。</strong>
            <br />
            内容完好地留在本机，界面不会假装它已经存好了。
            <div className="actions">
              <button className="link-btn" onClick={() => void retryArchive()}>
                重新归档
              </button>
              <button
                className="link-btn is-dim"
                onClick={() => {
                  const text = useLife.getState().exportText()
                  downloadText(text, `星履-档案-${dateStamp()}.json`)
                }}
              >
                导出到文件保底
              </button>
            </div>
          </div>
        ) : notice ? (
          <div
            className="status-note"
            role={notice.kind === 'error' ? 'alert' : undefined}
            style={notice.kind === 'error' ? undefined : { borderLeftColor: 'var(--cyan)' }}
          >
            <strong>{notice.text}</strong>
            {notice.detail ? (
              <>
                <br />
                {notice.detail}
              </>
            ) : null}
            <div className="actions">
              {/* 刚删过东西就在这里给「撤销」—— 面板关掉之后这是唯一的反悔入口 */}
              {lastDeleted && lastDeleted.achievements.length > 0 ? (
                <button className="link-btn" onClick={() => void undoLastDelete()}>
                  撤销删除{lastDeleted.achievements.length > 1 ? `（${lastDeleted.achievements.length} 颗）` : ''}
                </button>
              ) : null}
              <button className="link-btn is-dim" onClick={dismissNotice}>
                知道了
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {hoveredStar ? (
        <div className="hover-tip" ref={tipRef} style={{ left: tipPos.current.x, top: tipPos.current.y }}>
          <div className="t">{hoveredStar.achievement.title}</div>
          <div className="d">点击读它的故事</div>
        </div>
      ) : null}

      {stats.total === 0 && !faded ? (
        <div className="empty-hint">这片星空还是空的。点亮第一颗星，它就开始属于你了。</div>
      ) : null}

      {storageMode === 'memory' && !faded ? <div className="storage-warn">这台浏览器禁止了本地数据库 · 记得导出档案</div> : null}

      {status === 'saved' && stats.total > 0 && !notice ? (
        <div className="saved-tick">{`已归档 ${formatAgo(useLife.getState().lastSavedAt ?? Date.now())}`}</div>
      ) : null}
    </>
  )
}

/** 生卒年份的可读写法（公元前用「前」） */
function lifeSpan(b: number | null, d: number | null): string {
  const y = (v: number) => (v < 0 ? '前' + -v : String(v))
  if (b == null && d == null) return ''
  if (b != null && d != null) return y(b) + '–' + y(d)
  return b != null ? y(b) + '–' : '–' + y(d as number)
}

/** 每位人物都有一个可以直接分享的地址：/life/<id> */
function copyShareLink(id: string) {
  const url = window.location.origin + '/life/' + id
  try {
    void navigator.clipboard?.writeText(url)
  } catch {
    /* 剪贴板不可用时也不报错 */
  }
}

function yearOf(ms: number | null | undefined): string {
  if (ms == null) return '—'
  const y = new Date(ms).getFullYear()
  return y < 1000 ? `${y}` : `${y}`
}

export function downloadText(text: string, filename: string): void {
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
  } catch {
    /* 忽略：导出失败不影响任何已保存的内容 */
  }
}

export function dateStamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${`${d.getMonth() + 1}`.padStart(2, '0')}${`${d.getDate()}`.padStart(2, '0')}`
}
