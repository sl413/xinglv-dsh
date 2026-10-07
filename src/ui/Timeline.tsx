import { useMemo, useRef } from 'react'
import { clamp01 } from '../core/math'
import { msOfT } from '../core/layout'
import { formatWhen } from '../core/types'
import { useLife } from '../state/store'

/**
 * 时间回溯
 * ---------------------------------------------------------------------------
 * 一条横贯底部的轴：左端是记载的起点，右端是此刻。
 *
 * 它不是筛选器，而是宇宙本身的一维。往左拉，未来星会逐渐熄灭、光晕收缩、
 * 星轨从那一段开始消散、星云与盘面结构一起退去 —— 看到的是
 * 「当年的我拥有怎样的星空」，而不是「筛掉了哪些条目」。
 *
 * 自动播放：按播放键让这条轴自己往右走，等于把这一生重看一遍。
 * 倍率基准是「全程时长」而不是「每秒多少年」—— 它对任何档案都成立，
 * 界面上再把倍率换算成真实的年/秒显示出来，不让用户猜。
 * ★ 这个数字必须与 RuntimeBridge 里的 PLAY_SPAN_SECONDS 保持一致。
 */
const PLAY_SPAN_SECONDS = 30

export function Timeline() {
  const open = useLife((s) => s.timeOpen)
  const obsTime = useLife((s) => s.obsTime)
  const setObsTime = useLife((s) => s.setObsTime)
  const resetObsTime = useLife((s) => s.resetObsTime)
  const obsPlaying = useLife((s) => s.obsPlaying)
  const obsSpeed = useLife((s) => s.obsSpeed)
  const toggleObsPlay = useLife((s) => s.toggleObsPlay)
  const setObsPlaying = useLife((s) => s.setObsPlaying)
  const cycleObsSpeed = useLife((s) => s.cycleObsSpeed)
  const universe = useLife((s) => s.universe)
  const viewingLife = useLife((s) => s.viewingLife)
  const trackRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)
  // 拖动节流用：上一次把观测时刻写进 store 的时间（毫秒）
  const lastWriteRef = useRef(0)

  const { frame, stats, stars } = universe

  const marks = useMemo(() => {
    const out: Array<{ label: string; left: number }> = []
    const y0 = new Date(frame.originMs).getFullYear()
    const y1 = new Date(frame.endMs).getFullYear()
    const span = y1 - y0
    if (span > 40) return out
    const step = span > 14 ? 3 : span > 8 ? 2 : 1
    for (let y = y0; y <= y1; y += step) {
      const t = clamp01((new Date(y, 0, 1).getTime() - frame.originMs) / frame.spanMs)
      out.push({ label: `${y}`, left: t * 100 })
    }
    return out
  }, [frame])

  const litCount = useMemo(() => {
    let n = 0
    for (const s of stars) if (s.time <= obsTime + 0.004) n++
    return n
  }, [stars, obsTime])

  if (!open || stars.length === 0) return null

  const atNow = obsTime >= 0.999
  const ms = msOfT(obsTime, frame)
  // 记录停在很久以前的档案：右端是「最后」，不是「此刻」。
  // 用最后一条记录的年份判断，而不是 frame.endMs —— 后者带了一点构图余量，
  // 长跨度（近百年的一生）下这点余量会把末端推过判定线。
  const historical = (stats.lastMs ?? 0) < Date.now() - 2 * 365 * 86400000
  const endLabel = historical ? '最后' : '此刻'

  const valueFromEvent = (clientX: number): number => {
    const el = trackRef.current
    if (!el) return 1
    const rect = el.getBoundingClientRect()
    return clamp01((clientX - rect.left) / Math.max(1, rect.width))
  }

  // 播放速度说人话：倍率 + 真实速率 + 走完要多久。
  // 只显示「×2」等于没说 —— 用户不知道那到底是 2 年/秒 还是 20 年/秒。
  const spanYears = Math.max(1, (frame.endMs - frame.originMs) / (365.25 * 86400000))
  const yearsPerSecond = (spanYears * obsSpeed) / PLAY_SPAN_SECONDS
  const secondsLeft = Math.max(0, ((1 - obsTime) * PLAY_SPAN_SECONDS) / obsSpeed)
  const rateText =
    yearsPerSecond >= 2 ? `${yearsPerSecond.toFixed(1)} 年/秒` : `${(yearsPerSecond * 12).toFixed(1)} 月/秒`

  return (
    <div className="timeline">
      <button
        className={`tl-play${obsPlaying ? ' is-playing' : ''}`}
        onClick={toggleObsPlay}
        title={obsPlaying ? '暂停' : atNow ? '从头播放这一生' : '播放这一生'}
        aria-label={obsPlaying ? '暂停' : '播放'}
        aria-pressed={obsPlaying}
      >
        {obsPlaying ? <span className="tl-pause-bars" /> : <span className="tl-play-tri" />}
      </button>

      <div className="tl-body">
        <div className="tl-labels">
          <span className="tl-title">时间回溯</span>
          <span className="tl-readout">
            {atNow ? (
              viewingLife ? (
                <>
                  {endLabel}共留下 <b>{litCount}</b> 颗星
                </>
              ) : (
                <>
                  {endLabel}
                  <span className="tl-verbose">你的星空里</span>有 <b>{litCount}</b> 颗星
                </>
              )
            ) : (
              <>
                <b>{formatWhen(new Date(ms).toISOString().slice(0, 10), 'year')}</b>
                <span className="tl-dim">
                  {' · '}
                  {viewingLife ? (
                    <>那时共 {litCount} 颗星</>
                  ) : (
                    <>
                      那时<span className="tl-verbose">你的星空里</span>有 {litCount} 颗星
                    </>
                  )}
                </span>
              </>
            )}
          </span>
          <span className="tl-now">{endLabel}</span>
        </div>

        <div className="tl-speed-row">
          <button
            className="tl-speed"
            onClick={cycleObsSpeed}
            title="播放速度：点一下换一档"
          >
            ×{obsSpeed}
          </button>
          <span className="tl-speed-hint">
            {obsPlaying ? (
              <>
                {rateText} · 还有约 {Math.ceil(secondsLeft)} 秒
              </>
            ) : (
              <>{rateText} · 全程约 {Math.round(PLAY_SPAN_SECONDS / obsSpeed)} 秒</>
            )}
          </span>
          <button className="tl-reset" onClick={resetObsTime} disabled={atNow}>
            回到{endLabel}
          </button>
        </div>

        <div
          className={`tl-track${atNow ? '' : ' is-past'}`}
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="观测时刻"
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={obsTime}
          onPointerDown={(e) => {
            try {
              e.currentTarget.setPointerCapture(e.pointerId)
            } catch {
              /* 合成事件：不影响取值 */
            }
            // 手动拖动就停下自动播放：否则手指松开的瞬间时间又被推走，很别扭
            if (obsPlaying) setObsPlaying(false)
            draggingRef.current = true
            setObsTime(valueFromEvent(e.clientX))
          }}
          onPointerMove={(e) => {
            if (!draggingRef.current) return
            // ★ 节流：拖动时每次 pointermove 都写 store，等于 60 次/秒触发整棵 React 树重渲染
            //   （实测 63 次/秒，而同类的自动播放只写 12.5 次/秒）。画面平滑不靠这个 ——
            //   GPU 侧本来就在每帧把观测时刻向目标做指数逼近，所以这里 12 次/秒足够跟手。
            const now = performance.now()
            if (now - lastWriteRef.current < 80) return
            lastWriteRef.current = now
            setObsTime(valueFromEvent(e.clientX))
          }}
          onPointerUp={(e) => {
            draggingRef.current = false
            // 抬手时必须补写一次最终值，否则松手落在两帧之间会丢掉最后那一点
            setObsTime(valueFromEvent(e.clientX))
            lastWriteRef.current = 0
            try {
              e.currentTarget.releasePointerCapture?.(e.pointerId)
            } catch {
              /* 忽略 */
            }
          }}
          onPointerCancel={() => {
            draggingRef.current = false
          }}
          onDoubleClick={resetObsTime}
          onKeyDown={(e) => {
            if (e.key === ' ' || e.key === 'Enter') {
              // 空格 = 播放/暂停：整条轴上最常用的一个动作
              e.preventDefault()
              // ★ 阻止冒泡：全局 keydown（App.tsx）现在也处理空格，
              //   不拦一下的话聚焦在轴上按一次空格会被切换两次，等于没反应。
              e.stopPropagation()
              toggleObsPlay()
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault()
              e.stopPropagation()
              setObsPlaying(false)
              setObsTime(obsTime - 0.02)
            } else if (e.key === 'ArrowRight') {
              e.preventDefault()
              e.stopPropagation()
              setObsPlaying(false)
              setObsTime(obsTime + 0.02)
            }
          }}
        >
          <div className="tl-line" />
          <div className="tl-fill" style={{ width: `${obsTime * 100}%` }} />
          <div className="tl-handle" style={{ left: `${obsTime * 100}%` }} />
          <div className="tl-marks">
            {marks.map((m) => (
              <span key={m.label} className="tl-mark" style={{ left: `${m.left}%` }}>
                <i />
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className="tl-foot">
          <span>
            {stats.total} 颗星 · {stats.journeyCount} 段旅程 · {stats.constellationCount} 个星座
          </span>
          <span>{atNow ? '往左拉，回到那一年' : '未来区域保持黑暗与未知'}</span>
        </div>
      </div>
    </div>
  )
}
