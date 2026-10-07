import { createContext, useContext, useEffect, useState } from 'react'
import { DOMAINS, domainDef } from '../core/domains'
import { formatWhen, type Achievement, type DomainId, type Importance, type Resonance } from '../core/types'
import { useLife } from '../state/store'
import { guestImportanceLabel, importanceLabel, resonanceLabel, EMPTY_STORY_HINT } from './labels'

/**
 * 面板浮现的开关。
 * Reading() 决定「什么时候浮现」，每个面板只负责把 is-in 挂到自己的根节点上。
 */
const RevealCtx = createContext(true)

function useRevealClass(extra: string): string {
  return useContext(RevealCtx) ? `${extra} is-in` : extra
}

/**
 * 人生故事
 * ---------------------------------------------------------------------------
 * 点开一颗星之后看到的东西。这里不做数据面板：一屏之内就是
 * 「什么时候、属于哪一部分、它有多重要、被谁见证」以及最重要的一段 ——
 * 你为什么在意它。
 *
 * 星座面板是另一件事：它回答「那几年我到底在忙什么」。
 */

export function Reading() {
  const reading = useLife((s) => s.reading)
  const closeReading = useLife((s) => s.closeReading)
  const arrived = useLife((s) => s.arrived)
  const [ready, setReady] = useState(false)

  // 点开一颗星之后镜头要飞两三秒。面板若在点击那一瞬间就弹出来，
  // 就变成「一块静止的面板干等镜头赶到」—— 那是整段过渡里最生硬的一环。
  // 这里等 CameraRig 在飞行结束那一帧发出抵达信号，再让面板连同内部的字一起浮上来。
  useEffect(() => {
    if (!reading) {
      setReady(false)
      return
    }
    if (arrived) {
      setReady(true)
      return
    }
    // 兜底：万一抵达信号丢了（飞行被打断等），也不能把面板永远藏着
    const t = window.setTimeout(() => setReady(true), 3000)
    return () => window.clearTimeout(t)
  }, [reading, arrived])

  if (!reading) return null
  return (
    <RevealCtx.Provider value={ready}>
      {reading.kind === 'star' ? (
        <StarReading id={reading.id} onClose={closeReading} />
      ) : reading.kind === 'constellation' ? (
        <ConstellationReading id={reading.id} onClose={closeReading} />
      ) : reading.kind === 'path' ? (
        <PathReading onClose={closeReading} />
      ) : (
        <OverviewReading onClose={closeReading} />
      )}
    </RevealCtx.Provider>
  )
}

/* ------------------------------------------------------------------ 来时路 */

/** 来时路：把所有经历按年份倒序列出来。想看「我到底做过什么」的时候用它。 */
function PathReading({ onClose }: { onClose: () => void }) {
  const universe = useLife((s) => s.universe)
  const focusStar = useLife((s) => s.focusStar)
  const returnCamera = useLife((s) => s.returnCamera)
  const deleteAchievements = useLife((s) => s.deleteAchievements)
  const undoLastDelete = useLife((s) => s.undoLastDelete)
  const lastDeleted = useLife((s) => s.lastDeleted)

  /** 管理态：把列表变成可勾选、可批量删除的清单 */
  const [managing, setManaging] = useState(false)
  const [picked, setPicked] = useState<string[]>([])
  const [confirmBatch, setConfirmBatch] = useState(false)

  const groups = (() => {
    const byYear = new Map<number, typeof universe.stars>()
    for (const s of universe.stars) {
      const y = new Date(s.ms).getFullYear()
      const list = byYear.get(y)
      if (list) list.push(s)
      else byYear.set(y, [s])
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => ({ year, list: [...list].sort((a, b) => b.ms - a.ms) }))
  })()

  const allIds = universe.stars.map((s) => s.id)
  const pickedSet = new Set(picked)
  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const runBatchDelete = async () => {
    const ids = [...picked]
    setConfirmBatch(false)
    const ok = await deleteAchievements(ids, true)
    if (ok) {
      setPicked([])
      setManaging(false)
    }
  }

  return (
    <section className={useRevealClass('panel reading path-panel')} aria-label="来时路">
      <header className="panel-head">
        <div>
          <div className="panel-title">来时路</div>
          <div className="panel-sub">
            {universe.stats.total} 颗星 · {groups.length} 个年头
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {universe.stats.total > 0 ? (
            <button
              className={`ghost-btn${managing ? ' is-on' : ''}`}
              onClick={() => {
                setManaging((m) => !m)
                setPicked([])
                setConfirmBatch(false)
              }}
            >
              {managing ? '完成' : '管理'}
            </button>
          ) : null}
          <button className="close-x" onClick={onClose}>
            ✕
          </button>
        </div>
      </header>

      {managing ? (
        <div className="manage-bar">
          <span className="mb-count">{picked.length === 0 ? '选中要删的星' : `已选 ${picked.length} 颗`}</span>
          <button
            className="link-btn is-dim"
            onClick={() => setPicked(picked.length === allIds.length ? [] : allIds)}
          >
            {picked.length === allIds.length ? '取消全选' : '全选'}
          </button>
          {confirmBatch ? (
            <>
              <button className="link-btn is-rose" onClick={runBatchDelete}>
                确认删除 {picked.length} 颗
              </button>
              <button className="link-btn is-dim" onClick={() => setConfirmBatch(false)}>
                取消
              </button>
            </>
          ) : (
            <button
              className="link-btn is-rose"
              disabled={picked.length === 0}
              onClick={() => setConfirmBatch(true)}
            >
              删除所选
            </button>
          )}
        </div>
      ) : null}

      <div className="reading-scroll">
        {groups.length === 0 ? (
          <p className="story is-empty">还没有路。点亮第一颗星之后，这里会按年份长出来。</p>
        ) : (
          groups.map((g) => (
            <div key={g.year} className="path-year">
              <div className="path-year-head">
                <span className="path-year-label">{g.year}</span>
                <span className="path-year-count">{g.list.length} 颗</span>
              </div>
              {g.list.map((s) => {
                const def = domainDef(s.domain)
                if (managing) {
                  const on = pickedSet.has(s.id)
                  return (
                    <button
                      key={s.id}
                      className={`constellation-item is-pick${on ? ' is-picked' : ''}`}
                      onClick={() => toggle(s.id)}
                      aria-pressed={on}
                    >
                      <span className={`pick-box${on ? ' is-on' : ''}`}>{on ? '✓' : ''}</span>
                      <span className="swatch" style={{ width: 5, height: 5, borderRadius: '50%', background: def.color }} />
                      <span className="ci-title">{s.achievement.title}</span>
                      <span className="ci-date">{formatWhen(s.achievement.happenedAt, 'month')}</span>
                    </button>
                  )
                }
                return (
                  <div key={s.id} className="path-row">
                    <button className="constellation-item" onClick={() => focusStar(s.id)}>
                      <span className="swatch" style={{ width: 5, height: 5, borderRadius: '50%', background: def.color }} />
                      <span className="ci-title">{s.achievement.title}</span>
                      <span className="ci-date">{formatWhen(s.achievement.happenedAt, 'month')}</span>
                    </button>
                    <button
                      className="row-del"
                      title="删除这颗星"
                      onClick={async () => {
                        await deleteAchievements([s.id], true)
                      }}
                    >
                      删除
                    </button>
                  </div>
                )
              })}
            </div>
          ))
        )}

        {lastDeleted && lastDeleted.achievements.length > 0 ? (
          <div className="undo-bar">
            <span>
              刚删掉 {lastDeleted.achievements.length} 颗
              {lastDeleted.achievements.length === 1 ? `：${lastDeleted.achievements[0].title}` : ''}
            </span>
            <button
              className="link-btn"
              onClick={() => {
                void undoLastDelete()
              }}
            >
              撤销
            </button>
          </div>
        ) : null}

        <div className="reading-actions">
          <button className="link-btn is-dim" onClick={returnCamera}>
            回到星空
          </button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ 一颗星 */

function StarReading({ id, onClose }: { id: string; onClose: () => void }) {
  const universe = useLife((s) => s.universe)
  const update = useLife((s) => s.updateAchievement)
  const remove = useLife((s) => s.deleteAchievement)
  const focusStar = useLife((s) => s.focusStar)
  const returnCamera = useLife((s) => s.returnCamera)
  const viewingLife = useLife((s) => s.viewingLife)

  const index = universe.byId.get(id)
  const star = index == null ? null : universe.stars[index]
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [draft, setDraft] = useState<Achievement | null>(star?.achievement ?? null)

  useEffect(() => {
    setEditing(false)
    setConfirmDelete(false)
    setDraft(star?.achievement ?? null)
  }, [id, star?.achievement])

  if (!star || !draft) {
    return (
      <section className="panel reading">
        <header className="panel-head">
          <div className="panel-title">这颗星不见了</div>
          <button className="close-x" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="reading-scroll">
          <p className="story">它可能已经被删除了。</p>
          <div className="reading-actions">
            <button className="link-btn" onClick={returnCamera}>
              返回镜头
            </button>
          </div>
        </div>
      </section>
    )
  }

  const a = star.achievement
  const def = domainDef(a.domain)

  return (
    <section className={useRevealClass('panel reading')} aria-label="人生故事">
      <header className="panel-head">
        <div>
          <div className="panel-sub">
            {a.journeyId ? universe.trails.find((t) => t.journeyId === a.journeyId)?.name ?? '一段旅程' : '一颗人生星'}
          </div>
        </div>
        <button className="close-x" onClick={onClose} title="关闭">
          ✕
        </button>
      </header>

      <div className="reading-scroll">
        {editing ? (
          <div className="edit-grid">
            <label className="field">
              <span className="field-label">发生了什么</span>
              <textarea
                className="text-area"
                rows={2}
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">什么时候发生</span>
              <input
                className="text-input is-when"
                type="date"
                value={draft.happenedAt.slice(0, 10)}
                onChange={(e) => setDraft({ ...draft, happenedAt: e.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">为什么它对你重要</span>
              <textarea
                className="text-area"
                rows={6}
                value={draft.reflection}
                onChange={(e) => setDraft({ ...draft, reflection: e.target.value })}
              />
            </label>
            <div className="field">
              <span className="field-label">领域</span>
              <div className="chips">
                {DOMAINS.map((d) => (
                  <button
                    key={d.id}
                    className={`chip${draft.domain === d.id ? ' is-on' : ''}`}
                    onClick={() => setDraft({ ...draft, domain: d.id as DomainId })}
                  >
                    <span className="swatch" style={{ background: d.color }} />
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <span className="field-label">重要程度</span>
              <div className="scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`pip${draft.importance >= n ? ' is-on' : ''}`}
                    style={{ width: 14 + n * 3, height: 14 + n * 3 }}
                    title={importanceLabel(n)}
                    onClick={() => setDraft({ ...draft, importance: n as Importance })}
                  />
                ))}
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>{importanceLabel(draft.importance)}</span>
              </div>
            </div>
            <div className="field">
              <span className="field-label">被理解与见证的程度</span>
              <div className="scale">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    className={`pip${draft.resonance >= n && n > 0 ? ' is-on' : ''}`}
                    title={resonanceLabel(n)}
                    onClick={() => setDraft({ ...draft, resonance: n as Resonance })}
                  />
                ))}
                <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--text-faint)' }}>{resonanceLabel(draft.resonance)}</span>
              </div>
            </div>
            <label className="field">
              <span className="field-label">见证或同行的人</span>
              <input
                className="text-input"
                value={(draft.witnesses ?? []).join('，')}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    witnesses: e.target.value
                      .split(/[,，、]+/)
                      .map((x) => x.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
            <div className="reading-actions">
              <button
                className="primary-btn"
                onClick={() => {
                  void update(id, {
                    title: draft.title,
                    happenedAt: draft.happenedAt,
                    reflection: draft.reflection,
                    domain: draft.domain,
                    importance: draft.importance,
                    resonance: draft.resonance,
                    witnesses: draft.witnesses,
                  })
                  setEditing(false)
                }}
              >
                保存
              </button>
              <button className="link-btn is-dim" onClick={() => setEditing(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <h2 className="reading-title">{a.title}</h2>
            <div className="meta-row">
              <span>{formatWhen(a.happenedAt)}</span>
              <span className="sep">·</span>
              <span className="meta-tag">
                <span className="swatch" style={{ width: 7, height: 7, borderRadius: '50%', background: def.color }} />
                {def.label}
              </span>
              <span className="sep">·</span>
              <span>{viewingLife ? guestImportanceLabel(a.importance) : importanceLabel(a.importance)}</span>
              <span className="sep">·</span>
              <span>{viewingLife ? '共鸣度未评价' : resonanceLabel(a.resonance)}</span>
            </div>

            <div className="section-label">{viewingLife ? (viewingLife.fictional ? '虚构记录' : '史实背景') : '为什么它对我重要'}</div>
            <p className={`story${a.reflection.trim() ? '' : ' is-empty'}`}>{a.reflection.trim() || EMPTY_STORY_HINT}</p>

            {a.witnesses && a.witnesses.length > 0 ? (
              <>
                <div className="section-label">见证与同行的人</div>
                <div className="witnesses">
                  {a.witnesses.map((w) => (
                    <span className="witness" key={w}>
                      {w}
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            {a.tags && a.tags.length > 0 ? (
              <>
                <div className="section-label">只属于我的标签</div>
                <div className="witnesses">
                  {a.tags.map((t) => (
                    <span className="witness" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </>
            ) : null}

            <div className="reading-actions">
              {viewingLife ? null : (
                <button className="link-btn" onClick={() => setEditing(true)}>
                  让这颗星更完整
                </button>
              )}
              <button className="link-btn is-dim" onClick={() => focusStar(id)}>
                再靠近一点
              </button>
              <button className="link-btn is-dim" onClick={returnCamera}>
                返回
              </button>
            </div>

            {viewingLife ? (
              <div className="guest-provenance">
                <strong>{viewingLife.name}的一生 · 群星列传</strong>
                <br />
                {viewingLife.provenance}
                <br />
                重要程度规则：{viewingLife.importanceRule}
                <br />
                共鸣度为占位值 —— 星履不对一个人有多伟大下判断。
              </div>
            ) : (
              <div className="reading-actions" style={{ marginTop: 10, paddingTop: 12 }}>
                {confirmDelete ? (
                  <>
                    <button
                      className="link-btn"
                      style={{ color: 'var(--rose)' }}
                      onClick={() => {
                        void remove(id)
                      }}
                    >
                      确认删除
                    </button>
                    <button className="link-btn is-dim" onClick={() => setConfirmDelete(false)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button className="link-btn is-rose" onClick={() => setConfirmDelete(true)}>
                    删除这颗星
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ 星座 */

function ConstellationReading({ id, onClose }: { id: string; onClose: () => void }) {
  const universe = useLife((s) => s.universe)
  const focusStar = useLife((s) => s.focusStar)
  const returnCamera = useLife((s) => s.returnCamera)
  const c = universe.constellations.find((x) => x.id === id)
  if (!c) return null
  const def = domainDef(c.domain)
  const members = c.memberIds
    .map((mid) => {
      const idx = universe.byId.get(mid)
      return idx == null ? null : universe.stars[idx]
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => a.ms - b.ms)

  return (
    <section className={useRevealClass('panel reading')} aria-label="人生星座">
      <header className="panel-head">
        <div>
          <div className="panel-title">{c.label}</div>
          <div className="panel-sub">
            {members.length} 颗星 · {c.yearA === c.yearB ? `${c.yearA} 年` : `${c.yearA}–${c.yearB}`}
          </div>
        </div>
        <button className="close-x" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="reading-scroll">
        <div className="meta-row">
          <span className="meta-tag">
            <span className="swatch" style={{ width: 7, height: 7, borderRadius: '50%', background: def.color }} />
            {def.label}
          </span>
          <span className="sep">·</span>
          <span>{def.blurb}</span>
        </div>
        <div className="section-label">这一段里的星</div>
        <div className="constellation-list">
          {members.map((s) => (
            <button key={s.id} className="constellation-item" onClick={() => focusStar(s.id)}>
              <span className="swatch" style={{ width: 5, height: 5, borderRadius: '50%', background: def.color }} />
              <span className="ci-title">{s.achievement.title}</span>
              <span className="ci-date">{formatWhen(s.achievement.happenedAt, 'month')}</span>
            </button>
          ))}
        </div>
        <div className="reading-actions">
          <button className="link-btn is-dim" onClick={returnCamera}>
            返回镜头
          </button>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ 星河 */

function OverviewReading({ onClose }: { onClose: () => void }) {
  const universe = useLife((s) => s.universe)
  const returnCamera = useLife((s) => s.returnCamera)
  const focusConstellation = useLife((s) => s.focusConstellation)
  const viewingLife = useLife((s) => s.viewingLife)
  const { frame, stats } = universe

  const first = stats.firstMs
  const last = Math.min(stats.lastMs ?? Date.now(), Date.now())
  const years = Math.max(0, (last - (first ?? last)) / (365.25 * 86400000))
  const domainRows = DOMAINS.map((d) => ({ def: d, count: stats.byDomain[d.id] ?? 0 })).filter((r) => r.count > 0)
  const maxCount = Math.max(1, ...domainRows.map((r) => r.count))
  // 星空里不再有任何文字标注，所以星座的入口在这里：
  // 面板在星空之外，点一行就聚焦那一团星。
  const constellationRows = universe.constellations
    .filter((c) => c.formed)
    .sort((a, b) => b.memberIds.length - a.memberIds.length)

  return (
    <section className={useRevealClass('panel reading')} aria-label="星河概览">
      <header className="panel-head">
        <div>
          <div className="panel-title">{viewingLife ? `${viewingLife.name}的星河` : '你的星河'}</div>
          <div className="panel-sub">
            {stats.total} 颗星 · {stats.journeyCount} 段旅程 · {stats.constellationCount} 个星座
          </div>
        </div>
        <button className="close-x" onClick={onClose}>
          ✕
        </button>
      </header>
      <div className="reading-scroll">
        {stats.total === 0 ? (
          <p className="story is-empty">这里还是空的。点亮第一颗星之后，这片星河就开始属于你了。</p>
        ) : (
          <>
            <p className="story">
              {first ? `${formatWhen(new Date(first).toISOString().slice(0, 10), 'month')} 到 ${formatWhen(new Date(last).toISOString().slice(0, 10), 'month')}` : ''}
              ，一共 {years < 1 ? '不到一年' : `${years.toFixed(1)} 年`}。
              {'\n'}你把它们留了下来，于是它们就一直在那里。
            </p>
            <div className="section-label">它们分布在人生的哪些部分</div>
            <div>
              {domainRows.map((r) => (
                <div key={r.def.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0' }}>
                  <span style={{ width: 52, fontSize: 11.5, color: 'var(--text-faint)', letterSpacing: '0.08em' }}>{r.def.label}</span>
                  <span
                    style={{
                      flex: 1,
                      height: 2,
                      borderRadius: 1,
                      background: `linear-gradient(90deg, ${r.def.color}${'88'}, ${r.def.color}22)`,
                      maxWidth: `${Math.round((r.count / maxCount) * 100)}%`,
                      minWidth: 8,
                    }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-ghost)', fontVariantNumeric: 'tabular-nums' }}>{r.count}</span>
                </div>
              ))}
            </div>
            <div className="section-label">此刻</div>
            <p className="story" style={{ color: 'var(--text-faint)' }}>
              从 {formatWhen(new Date(frame.endMs).toISOString().slice(0, 10), 'month')} 往回看，
              {viewingLife ? '这就是他走过的路。' : '这就是你走过的路。'}
            </p>

            {constellationRows.length > 0 ? (
              <>
                <div className="section-label">人生星座</div>
                <p className="story" style={{ color: 'var(--text-ghost)', fontSize: 11.5 }}>
                  星空里不写任何文字。想看哪一团星，从这里进去。
                </p>
                <div>
                  {constellationRows.slice(0, 14).map((c) => (
                    <button key={c.id} className="constellation-item" onClick={() => focusConstellation(c.id)}>
                      <span
                        className="swatch"
                        style={{ width: 6, height: 6, borderRadius: '50%', background: domainDef(c.domain).color }}
                      />
                      <span className="ci-title">{c.spanText}</span>
                      <span className="ci-date">{c.memberIds.length} 颗</span>
                    </button>
                  ))}
                </div>
                {constellationRows.length > 14 ? (
                  <p className="story" style={{ color: 'var(--text-ghost)', fontSize: 11.5 }}>
                    记录越多，星座越多 —— 这里只列出最大的 14 个，另外还有 {constellationRows.length - 14} 个更小的。
                  </p>
                ) : null}
              </>
            ) : null}
          </>
        )}
        <div className="reading-actions">
          <button className="link-btn is-dim" onClick={returnCamera}>
            回到星空
          </button>
        </div>
      </div>
    </section>
  )
}

export function msToDateInput(ms: number): string {
  const d = new Date(ms)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
