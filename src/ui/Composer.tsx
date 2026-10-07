import { useEffect, useMemo, useRef, useState } from 'react'
import { DOMAINS, domainDef, inferDomain } from '../core/domains'
import { formatAgo, toDateInput, type DomainId, type Importance, type Resonance } from '../core/types'
import { useLife } from '../state/store'
import { IMPORTANCE_LABEL, RESONANCE_LABEL } from './labels'

/**
 * 点亮一颗星
 * ---------------------------------------------------------------------------
 * 首屏只问三个问题：发生了什么、什么时候发生、为什么它对你重要。
 * 其余一切（领域、重要程度、被谁见证、属于哪段旅程）都在「再完善一下」里，
 * 而且都可以永远不填 —— 先留下，再完善。
 *
 * 输入每一次变化都会同步落盘。归档失败不会清空任何东西。
 */

export function Composer() {
  const open = useLife((s) => s.composerOpen)
  const draft = useLife((s) => s.draft)
  const status = useLife((s) => s.status)
  const draftSavedAt = useLife((s) => s.draftSavedAt)
  const draftRestored = useLife((s) => s.draftRestored)
  const unsavedArchive = useLife((s) => s.unsavedArchive)
  const journeys = useLife((s) => s.archive.journeys)
  const patchDraft = useLife((s) => s.patchDraft)
  const lightStar = useLife((s) => s.lightStar)
  const retryArchive = useLife((s) => s.retryArchive)
  const closeComposer = useLife((s) => s.closeComposer)
  const discardDraft = useLife((s) => s.discardDraft)

  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const titleRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setConfirmDiscard(false)
      const t = window.setTimeout(() => titleRef.current?.focus(), 220)
      return () => window.clearTimeout(t)
    }
  }, [open])

  const suggestion = useMemo(() => {
    if (draft.domain !== 'unfiled') return null
    const guess = inferDomain(`${draft.title} ${draft.reflection}`)
    if (guess.domain === 'unfiled' || guess.score < 2) return null
    return domainDef(guess.domain)
  }, [draft.domain, draft.title, draft.reflection])

  if (!open) return null

  const canSubmit = draft.title.trim().length > 0 && !busy

  const submit = async () => {
    if (!canSubmit) {
      setError('先写下发生了什么，哪怕只有几个字。')
      return
    }
    setBusy(true)
    setError(null)
    const res = await lightStar({
      title: draft.title,
      happenedAt: draft.happenedAt,
      reflection: draft.reflection,
      domain: draft.domain === 'unfiled' ? undefined : draft.domain,
      importance: draft.importance,
      resonance: draft.resonance,
      journeyName: draft.journeyName,
      witnesses: draft.witnesses,
      tags: draft.tags,
      autoDomain: true,
    })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? '没能完成归档')
      return
    }
    // 归档确认成功之后 store 才会清草稿并启动诞生仪式
  }

  return (
    <section className="panel composer" aria-label="点亮一颗星">
      <header className="panel-head">
        <div>
          <div className="panel-title">点亮一颗星</div>
          <div className="panel-sub">每一次真实的经历，都值得在星空中留下光</div>
        </div>
        <button className="close-x" title="收起（内容会保留）" onClick={closeComposer}>
          ✕
        </button>
      </header>

      <div className="composer-scroll">
        {draftRestored && draft.title.trim() ? (
          <div className="composer-first">
            上一次没写完的还在这里{draftSavedAt ? ` · 已暂存于本机 · ${formatAgo(draftSavedAt)}` : ''}
          </div>
        ) : (
          <div className="composer-first">
            不必完整，也不必漂亮。先把那一刻留下来，剩下的可以以后慢慢补。
          </div>
        )}

        <label className="field">
          <span className="field-label">发生了什么</span>
          <textarea
            ref={titleRef}
            className="text-area"
            rows={2}
            style={{ minHeight: 62 }}
            value={draft.title}
            placeholder="例：第一次把我做的东西交给了陌生人"
            maxLength={120}
            onChange={(e) => patchDraft({ title: e.target.value })}
          />
          {suggestion ? (
            <span className="domain-suggest">
              <span className="swatch" style={{ background: suggestion.color }} />
              星履猜它属于「{suggestion.label}」——
              <button className="link-btn" onClick={() => patchDraft({ domain: suggestion.id })}>
                就放这里
              </button>
            </span>
          ) : null}
        </label>

        <label className="field">
          <span className="field-label">什么时候发生</span>
          <input
            className="text-input is-when"
            type="date"
            value={draft.happenedAt}
            max={toDateInput(new Date())}
            onChange={(e) => patchDraft({ happenedAt: e.target.value })}
          />
          <span className="field-hint">只记得大概也行：把年份写对就够了。</span>
        </label>

        <label className="field">
          <span className="field-label">
            为什么它对你重要<span className="optional">可以以后再写</span>
          </span>
          <textarea
            className="text-area"
            rows={4}
            value={draft.reflection}
            placeholder="写给未来的自己。也许只是：那天我终于没有放弃。"
            maxLength={4000}
            onChange={(e) => patchDraft({ reflection: e.target.value })}
          />
        </label>

        <button
          className={`refine-toggle${draft.expanded ? ' is-open' : ''}`}
          onClick={() => patchDraft({ expanded: !draft.expanded })}
        >
          <span className="caret">▶</span>
          再完善一下（让这颗星更完整）
        </button>

        {draft.expanded ? (
          <div className="refine">
            <div className="field">
              <span className="field-label">属于人生的哪一部分</span>
              <div className="chips">
                {DOMAINS.map((d) => (
                  <button
                    key={d.id}
                    className={`chip${draft.domain === d.id ? ' is-on' : ''}`}
                    onClick={() => patchDraft({ domain: d.id as DomainId })}
                    title={d.blurb}
                  >
                    <span className="swatch" style={{ background: d.color }} />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <span className="field-label">它有多重要（由你自己定义）</span>
              <div className="scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`pip${draft.importance >= n ? ' is-on' : ''}`}
                    style={{ width: 16 + n * 3, height: 16 + n * 3 }}
                    aria-label={IMPORTANCE_LABEL[n]}
                    title={IMPORTANCE_LABEL[n]}
                    onClick={() => patchDraft({ importance: n as Importance })}
                  />
                ))}
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {IMPORTANCE_LABEL[draft.importance]}
                </span>
              </div>
              <div className="scale-legend">
                <span>越重要，星体越大</span>
              </div>
            </div>

            <div className="field">
              <span className="field-label">有多少人知道、理解并见证了它</span>
              <div className="scale">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`pip${draft.resonance >= n && n > 0 ? ' is-on' : ''}`}
                    style={n === 0 ? { width: 13, height: 13, opacity: draft.resonance === 0 ? 1 : 0.5 } : undefined}
                    aria-label={RESONANCE_LABEL[n]}
                    title={RESONANCE_LABEL[n]}
                    onClick={() => patchDraft({ resonance: n as Resonance })}
                  />
                ))}
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>
                  {RESONANCE_LABEL[draft.resonance]}
                </span>
              </div>
              <div className="scale-legend">
                <span>越被理解，星光越亮</span>
                <span>不由点赞数决定</span>
              </div>
            </div>

            <label className="field">
              <span className="field-label">
                属于哪段旅程<span className="optional">同一段旅程的星会被星轨连起来</span>
              </span>
              <input
                className="text-input"
                list="xinglv-journeys"
                value={draft.journeyName}
                placeholder="例：从转行到靠它生活"
                maxLength={40}
                onChange={(e) => patchDraft({ journeyName: e.target.value })}
              />
              <datalist id="xinglv-journeys">
                {journeys.map((j) => (
                  <option key={j.id} value={j.name} />
                ))}
              </datalist>
            </label>

            <label className="field">
              <span className="field-label">
                见证或同行的人<span className="optional">用逗号分隔</span>
              </span>
              <input
                className="text-input"
                value={draft.witnesses}
                placeholder="例：妈妈，老陈"
                maxLength={120}
                onChange={(e) => patchDraft({ witnesses: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field-label">
                只属于你的标签<span className="optional">用逗号分隔</span>
              </span>
              <input
                className="text-input"
                value={draft.tags}
                placeholder="例：第一次，深夜"
                maxLength={120}
                onChange={(e) => patchDraft({ tags: e.target.value })}
              />
            </label>
          </div>
        ) : null}

        {error ? (
          <div className="form-error">
            {error}
            <div style={{ marginTop: 6, color: 'var(--text-ghost)' }}>
              你写下的内容仍然完好地留在这里，也已暂存在本机 —— 可以直接重试。
            </div>
          </div>
        ) : null}

        {status === 'unsaved' && unsavedArchive ? (
          <div className="form-error" style={{ borderColor: 'rgba(201,154,91,0.32)', background: 'rgba(201,154,91,0.07)', color: '#e6d3ae' }}>
            本机存档暂时写不进去。内容没有丢，可以再试一次。
            <div className="actions">
              <button className="link-btn" onClick={() => void retryArchive()}>
                重新归档
              </button>
            </div>
          </div>
        ) : null}

        <div className="composer-actions">
          <div className="save-state">
            <span className={`dot${status === 'unsaved' ? ' is-rose' : ''}`} />
            {draftSavedAt ? `已暂存在本机 · ${formatAgo(draftSavedAt)}` : '写下的第一句话就会自动暂存'}
            {draft.title.trim() || draft.reflection.trim() ? (
              <>
                <span style={{ color: 'var(--text-ghost)' }}>·</span>
                {confirmDiscard ? (
                  <>
                    <button className="link-btn is-dim" onClick={() => setConfirmDiscard(false)}>
                      取消
                    </button>
                    <button
                      className="link-btn is-dim"
                      onClick={() => {
                        discardDraft()
                        setConfirmDiscard(false)
                      }}
                    >
                      确认清空
                    </button>
                  </>
                ) : (
                  <button className="link-btn is-dim" onClick={() => setConfirmDiscard(true)}>
                    清空
                  </button>
                )}
              </>
            ) : null}
          </div>
          <button className="primary-btn" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? '正在点亮…' : '点亮这颗星'}
          </button>
        </div>
      </div>
    </section>
  )
}
