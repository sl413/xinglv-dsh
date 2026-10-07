import { useEffect, useRef } from 'react'
import { DOMAINS, domainDef } from '../core/domains'
import { useLife } from '../state/store'

/**
 * 人生领域
 * ---------------------------------------------------------------------------
 * 一个很轻的下拉：列出九个领域各自有多少颗星。
 * 点其中一个，那一条星臂会被点亮，其余的星臂、星体与盘面星尘一起退到很暗 ——
 * 这样「技术」是你人生里多粗的一条河流，一眼就能看出来。
 *
 * 这不是筛选：星一颗都不会消失，只是把光集中到一条路上。
 */

export function DomainLegend() {
  const open = useLife((s) => s.domainOpen)
  const setOpen = useLife((s) => s.setDomainOpen)
  const focus = useLife((s) => s.domainFocus)
  const setDomainFocus = useLife((s) => s.setDomainFocus)
  const byDomain = useLife((s) => s.universe.stats.byDomain)
  const total = useLife((s) => s.universe.stats.total)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const el = boxRef.current
      if (el && e.target instanceof Node && !el.contains(e.target)) setOpen(false)
    }
    window.addEventListener('pointerdown', onDown)
    return () => window.removeEventListener('pointerdown', onDown)
  }, [open, setOpen])

  if (!open) return null

  const rows = DOMAINS.map((d) => ({ def: d, count: byDomain[d.id] ?? 0 }))
  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div className="domain-legend" ref={boxRef}>
      <div className="dl-head">
        <span>人生领域</span>
        <span className="dl-total">{total} 颗星</span>
      </div>
      <div className="dl-list">
        {rows.map((r) => (
          <button
            key={r.def.id}
            className={`dl-row${focus === r.def.id ? ' is-on' : ''}${r.count === 0 ? ' is-empty' : ''}`}
            onClick={() => setDomainFocus(focus === r.def.id ? null : r.def.id)}
            title={r.def.blurb}
          >
            <span className="dl-dot" style={{ background: r.def.color }} />
            <span className="dl-name">{r.def.label}</span>
            <span className="dl-bar">
              <i style={{ width: `${Math.round((r.count / max) * 100)}%`, background: r.def.color }} />
            </span>
            <span className="dl-count">{r.count}</span>
          </button>
        ))}
      </div>
      <div className="dl-foot">
        {focus ? (
          <button className="link-btn" onClick={() => setDomainFocus(null)}>
            显示全部领域
          </button>
        ) : (
          <span>点一个领域，只看那一条路</span>
        )}
      </div>
    </div>
  )
}

/** 顶部按钮上显示当前高亮的领域名 */
export function useDomainLabel(): string {
  const focus = useLife((s) => s.domainFocus)
  return focus ? domainDef(focus).label : '人生领域'
}
