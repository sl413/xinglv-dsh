import { useEffect, useMemo, useState } from 'react'
import { STATIC_SITE } from '../../core/buildMode'
import { DOMAINS } from '../../core/domains'
import { navigate } from '../../core/router'
import { changePassword, adminBackups, adminRestore } from '../../core/lives/admin'
import { emptyAchievement, emptyLife, type LifeDoc, type ServerAchievement } from '../../core/lives/types'
import { useLife } from '../../state/store'

/**
 * 群星列传 · 管理端
 * ---------------------------------------------------------------------------
 * 只有登录后的站长能用。前端把入口藏起来只是体验，
 * 真正的守门人在服务器：/api/admin/* 每一条都会独立校验会话。
 * 个人成就与这里没有任何关系 —— 管理端只写公开名人库。
 */

export function AdminPanel() {
  const admin = useLife((s) => s.admin)
  const adminLives = useLife((s) => s.adminLives)
  const busy = useLife((s) => s.adminBusy)
  const error = useLife((s) => s.adminError)
  const editing = useLife((s) => s.editingLife)
  const setEditing = useLife((s) => s.setEditingLife)
  const login = useLife((s) => s.adminLogin)
  const logout = useLife((s) => s.adminLogout)
  const removeLife = useLife((s) => s.removeLife)
  const loadAdminLives = useLife((s) => s.loadAdminLives)
  const notice = useLife((s) => s.notice)

  const [password, setPassword] = useState('')
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)
  const [pwOpen, setPwOpen] = useState(false)
  // 历史版本：服务器每次落盘都留一代，这里是「删错了/改坏了」的反悔入口
  const [backups, setBackups] = useState<Array<{ name: string; at: string | null; count: number; size: number }>>([])
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null)
  const [restoreMsg, setRestoreMsg] = useState('')

  const refreshBackups = async () => {
    try {
      setBackups(await adminBackups())
    } catch {
      setBackups([])
    }
  }

  useEffect(() => {
    if (admin) void loadAdminLives()
    if (admin) void refreshBackups()
  }, [admin, loadAdminLives])

  // 纯静态托管（GitHub Pages）上没有服务器，登录必然失败。
  // 与其给一个点了没用、还会让人以为「口令错了」的登录框，不如直说。
  if (STATIC_SITE) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <div className="al-title">静态站点没有管理端</div>
          <p className="al-note">
            这个网址是把 dist 直接托管在 GitHub Pages 上的纯静态站点：
            没有服务器，所以不能登录，也不能改名人库。群星列传在这里是只读的。
          </p>
          <p className="al-note">
            要用管理端（新增人物、改条目、改口令），请在这台机器上跑起来：
            <code>pnpm build &amp;&amp; pnpm start</code>，然后打开本机地址。
          </p>
          <button className="ghost-btn" onClick={() => navigate({ name: 'sky' })}>
            回到我的星空
          </button>
        </div>
      </div>
    )
  }

  if (!admin) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <h1>站长登录</h1>
          <p>群星列传是公开的；只有你能改它。口令校验在服务器上完成，访客无论如何都改不了内容。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              const ok = await login(password)
              if (ok) setPassword('')
            }}
          >
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="管理员口令"
              autoComplete="current-password"
              aria-label="管理员口令"
            />
            <button className="primary-btn" type="submit" disabled={busy || !password}>
              {busy ? '登录中…' : '登录'}
            </button>
          </form>
          {error ? <div className="admin-error">{error}</div> : null}
          <button className="link-btn is-dim" onClick={() => navigate({ name: 'lives' })}>
            ← 回到群星列传
          </button>
        </div>
      </div>
    )
  }

  if (editing) {
    return (
      <LifeEditor
        life={editing}
        isNew={!adminLives.some((l) => l.id === editing.id)}
        onClose={() => setEditing(null)}
      />
    )
  }

  return (
    <div className="admin-page">
      <header className="admin-head">
        <div>
          <h1>名人库管理</h1>
          <p>共 {adminLives.length} 位（公开 {adminLives.filter((l) => l.published).length} 位）。保存后公开页面立刻更新。</p>
        </div>
        <div className="admin-head-actions">
          <button
            className="primary-btn"
            onClick={() => setEditing(emptyLife())}
            disabled={busy}
          >
            + 新增人物
          </button>
          <button className="ghost-btn" onClick={() => setPwOpen(!pwOpen)}>
            改口令
          </button>
          <button className="ghost-btn" onClick={() => navigate({ name: 'lives' })}>
            看公开页面
          </button>
          <button
            className="ghost-btn"
            onClick={async () => {
              await logout()
              navigate({ name: 'sky' })
            }}
          >
            退出登录
          </button>
        </div>
      </header>

      {pwOpen ? <PasswordForm onDone={() => setPwOpen(false)} /> : null}
      {notice?.kind === 'info' ? <div className="admin-ok">{notice.text}</div> : null}
      {error ? <div className="admin-error">{error}</div> : null}

      <div className="admin-table">
        {adminLives.map((l) => (
          <div key={l.id} className={`admin-row${l.published ? '' : ' is-off'}`}>
            <div className="ar-name">
              {l.name}
              {!l.published ? <span className="ar-badge">已撤下</span> : null}
            </div>
            <div className="ar-span">{l.span}</div>
            <div className="ar-count">{l.achievementCount} 条</div>
            <div className="ar-id">{l.id}</div>
            <div className="ar-actions">
              <button className="link-btn" onClick={() => void openForEdit(l.id, setEditing)}>
                编辑
              </button>
              <button className="link-btn is-dim" onClick={() => navigate({ name: 'life', id: l.id })}>
                看星空
              </button>
              {confirmRemove === l.id ? (
                <>
                  <button
                    className="link-btn"
                    style={{ color: 'var(--rose)' }}
                    onClick={async () => {
                      await removeLife(l.id)
                      setConfirmRemove(null)
                    }}
                  >
                    确认删除
                  </button>
                  <button className="link-btn is-dim" onClick={() => setConfirmRemove(null)}>
                    取消
                  </button>
                </>
              ) : (
                <button className="link-btn is-dim" onClick={() => setConfirmRemove(l.id)}>
                  删除
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <footer className="admin-foot">
        提示：只想暂时不公开某位人物，不必删除 —— 在编辑页把「公开发布」关掉再保存即可（公开列表里看不到，你仍然看得到）。
        <br />
        管理端只写服务器上的公开名人库；你的个人成就始终只存在这台设备的浏览器里，不经过服务器。
      </footer>

      {/* 历史版本：删除是一次点击就生效的破坏性操作，这里是它的反悔入口。
          每次落盘都会留一代（最多 5 代），恢复本身也会先把当前状态存一份。 */}
      <section className="admin-backups">
        <div className="ab-head">
          <h2>历史版本</h2>
          <p>
            {backups.length
              ? `服务器上留了 ${backups.length} 代，最近一次是 ${backups[0].count} 位 / ${new Date(backups[0].at ?? Date.now()).toLocaleString('zh-CN')}。`
              : '还没有历史版本（第一次落盘之后才会有）。'}
          </p>
          <button className="ghost-btn" onClick={() => void refreshBackups()} disabled={busy}>
            刷新
          </button>
        </div>
        {restoreMsg ? <div className="admin-ok">{restoreMsg}</div> : null}
        <div className="ab-list">
          {backups.map((b) => (
            <div key={b.name} className="ab-row">
              <span className="ab-name">{b.name}</span>
              <span className="ab-count">{b.count} 位</span>
              <span className="ab-at">{b.at ? new Date(b.at).toLocaleString('zh-CN') : '时间未知'}</span>
              {restoreTarget === b.name ? (
                <>
                  <button
                    className="link-btn"
                    style={{ color: 'var(--rose)' }}
                    onClick={async () => {
                      try {
                        const res = await adminRestore(b.name)
                        setRestoreMsg(`已恢复到 ${b.name}：${res.before} → ${res.after} 位。当前这一版也留了一份，可以再恢复回来。`)
                        await loadAdminLives()
                        await refreshBackups()
                      } catch (err) {
                        setRestoreMsg(`恢复失败：${err instanceof Error ? err.message : String(err)}`)
                      } finally {
                        setRestoreTarget(null)
                      }
                    }}
                  >
                    确认恢复（会替换当前名人库）
                  </button>
                  <button className="link-btn is-dim" onClick={() => setRestoreTarget(null)}>
                    取消
                  </button>
                </>
              ) : (
                <button className="link-btn is-dim" onClick={() => setRestoreTarget(b.name)}>
                  恢复这一版
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

async function openForEdit(id: string, setEditing: (l: LifeDoc) => void) {
  const { adminGet } = await import('../../core/lives/admin')
  try {
    setEditing(await adminGet(id))
  } catch {
    /* 错误由调用方的状态提示承担 */
  }
}

function PasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  return (
    <form
      className="admin-pw"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await changePassword(current, next)
          setOk(true)
          setMsg('口令已更新，旧会话已失效')
          setCurrent('')
          setNext('')
        } catch (err) {
          setOk(false)
          setMsg(err instanceof Error ? err.message : '改口令失败')
        }
      }}
    >
      <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="当前口令" aria-label="当前口令" />
      <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="新口令（至少 8 位）" aria-label="新口令" />
      <button className="primary-btn" type="submit" disabled={!current || next.length < 8}>
        更新
      </button>
      <button className="link-btn is-dim" type="button" onClick={onDone}>
        收起
      </button>
      {msg ? <span className={ok ? 'admin-ok-inline' : 'admin-error-inline'}>{msg}</span> : null}
    </form>
  )
}

/* ------------------------------------------------------------ 人物编辑页 */

function LifeEditor({ life, isNew, onClose }: { life: LifeDoc; isNew: boolean; onClose: () => void }) {
  const saveLife = useLife((s) => s.saveLife)
  const busy = useLife((s) => s.adminBusy)
  const error = useLife((s) => s.adminError)
  const [doc, setDoc] = useState<LifeDoc>(() => structuredClone(life))
  const [dirty, setDirty] = useState(false)

  const patch = (p: Partial<LifeDoc>) => {
    setDoc((d) => ({ ...d, ...p }))
    setDirty(true)
  }

  const setAch = (i: number, p: Partial<ServerAchievement>) => {
    setDoc((d) => {
      const list = d.achievements.slice()
      list[i] = { ...list[i], ...p }
      return { ...d, achievements: list }
    })
    setDirty(true)
  }

  const journeyNames = useMemo(() => doc.journeys.map((j) => j.name), [doc.journeys])
  const precisionHint = doc.achievements.length
    ? `当前 ${doc.achievements.length} 条：` +
      (['year', 'month', 'day'] as const)
        .map((p) => {
          const n = doc.achievements.filter((a) => precision(a.when) === p).length
          return n ? `${n} 条${p === 'year' ? '只到年' : p === 'month' ? '到月' : '到日'}` : ''
        })
        .filter(Boolean)
        .join(' · ')
    : '还没有条目'

  return (
    <div className="admin-page editor-page">
      <header className="admin-head">
        <div>
          <h1>{isNew ? '新增人物' : `编辑：${life.name}`}</h1>
          <p>
            {precisionHint}
            {dirty ? ' · 有未保存的改动' : ' · 没有未保存的改动'}
          </p>
        </div>
        <div className="admin-head-actions">
          <button
            className="primary-btn"
            disabled={busy || doc.name.trim().length === 0}
            onClick={async () => {
              const saved = await saveLife(doc, isNew)
              if (saved) onClose()
            }}
          >
            {busy ? '保存中…' : '保存并公开'}
          </button>
          <button className="ghost-btn" onClick={onClose}>
            返回列表
          </button>
        </div>
      </header>

      {error ? <div className="admin-error">{error}</div> : null}
      {dirty ? <div className="admin-warn">改动还没有保存。点「保存并公开」之后，公开页面才会更新。</div> : null}

      <section className="editor-block">
        <h2>基本资料</h2>
        <div className="field-grid">
          <label>
            <span>姓名</span>
            <input value={doc.name} onChange={(e) => patch({ name: e.target.value })} placeholder="苏轼" />
          </label>
          <label>
            <span>网址 id</span>
            <input
              value={doc.id}
              onChange={(e) => patch({ id: e.target.value.replace(/[^a-z0-9-]/g, '').toLowerCase() })}
              placeholder="su-shi（留空则按姓名自动生成）"
              disabled={!isNew}
            />
          </label>
          <label>
            <span>生年</span>
            <input
              type="number"
              value={doc.birthYear ?? ''}
              onChange={(e) => patch({ birthYear: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="1037"
            />
          </label>
          <label>
            <span>卒年</span>
            <input
              type="number"
              value={doc.deathYear ?? ''}
              onChange={(e) => patch({ deathYear: e.target.value === '' ? null : Number(e.target.value) })}
              placeholder="1101（在世可留空）"
            />
          </label>
          <label className="span-2">
            <span>一句定位</span>
            <input value={doc.tagline} onChange={(e) => patch({ tagline: e.target.value })} placeholder="北宋文人、官员，号东坡居士" />
          </label>
          <label className="span-2">
            <span>简短介绍</span>
            <textarea rows={3} value={doc.summary} onChange={(e) => patch({ summary: e.target.value })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={doc.published} onChange={(e) => patch({ published: e.target.checked })} />
            <span>公开发布（关掉＝从公开列表撤下，你仍能看到）</span>
          </label>
        </div>
      </section>

      <section className="editor-block">
        <h2>资料来源与规则（会显示在公开页面上）</h2>
        <div className="field-grid">
          <label className="span-2">
            <span>来源、收录范围与精度声明（会显示在公开页面上）</span>
            <textarea rows={3} value={doc.provenance} onChange={(e) => patch({ provenance: e.target.value })} />
          </label>
          <label className="span-2">
            <span>重要程度规则</span>
            <textarea rows={2} value={doc.importanceRule} onChange={(e) => patch({ importanceRule: e.target.value })} />
          </label>
        </div>
      </section>

      <section className="editor-block">
        <h2>旅程（把同一段路上的成就连起来）</h2>
        <div className="journey-edit">
          {doc.journeys.map((j, i) => (
            <div className="journey-row" key={j.id || i}>
              <input
                value={j.name}
                placeholder="旅程名称"
                onChange={(e) => {
                  const list = doc.journeys.slice()
                  list[i] = { ...list[i], name: e.target.value }
                  patch({ journeys: list })
                }}
              />
              <select
                value={j.domainHint ?? ''}
                onChange={(e) => {
                  const list = doc.journeys.slice()
                  list[i] = { ...list[i], domainHint: (e.target.value || undefined) as never }
                  patch({ journeys: list })
                }}
              >
                <option value="">（不指定领域）</option>
                {DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <button
                className="link-btn is-dim"
                onClick={() => patch({ journeys: doc.journeys.filter((_, k) => k !== i) })}
              >
                移除
              </button>
            </div>
          ))}
          <button
            className="link-btn"
            onClick={() =>
              patch({
                journeys: [
                  ...doc.journeys,
                  { id: `jr-${doc.id || 'new'}-${Date.now().toString(36)}`, name: '', domainHint: undefined },
                ],
              })
            }
          >
            + 增加一段旅程
          </button>
        </div>
      </section>

      <section className="editor-block">
        <div className="editor-block-head">
          <h2>成就（{doc.achievements.length} 条）</h2>
          <button
            className="link-btn"
            onClick={() => {
              patch({ achievements: [...doc.achievements, emptyAchievement()] })
            }}
          >
            + 增加一条成就
          </button>
        </div>
        <p className="editor-hint">
          <strong>只收录成就。</strong>作品、著作、论文、官职、功名、工程、荣誉、讲学、育人 —— 这些是成就。
          生卒、疾病、婚丧、迁居、单纯的出发与抵达、别人的作为不要放进来：那些是传记事件，
          人物的生卒年份填在上面的「生年 / 卒年」里。
          <br />
          日期可以只填年份（1037），也可以到月（1037-01）或到日（1037-01-08）；公开页面按你实际填的精度显示。
          「决定性成就」会记为重要程度 4，其余记为 3 —— 这是公开规则，不是评价。共鸣度不评分。
          <br />
          写完可以跑 <code>node scripts/check-library.mjs</code> 自查一遍，它会指出看起来不像成就的条目。
        </p>
        <div className="ach-list">
          {doc.achievements.map((a, i) => (
            <div className="ach-row" key={a.id || i}>
              <input
                className="ach-when"
                value={a.when}
                placeholder="1037"
                onChange={(e) => setAch(i, { when: e.target.value.trim() })}
              />
              <input
                className="ach-title"
                value={a.title}
                placeholder="成就名称"
                onChange={(e) => setAch(i, { title: e.target.value })}
              />
              <select className="ach-domain" value={a.domain} onChange={(e) => setAch(i, { domain: e.target.value as never })}>
                {DOMAINS.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select className="ach-journey" value={a.journey ?? ''} onChange={(e) => setAch(i, { journey: e.target.value || undefined })}>
                <option value="">（不属于任何旅程）</option>
                {journeyNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
              <label className="ach-pivotal">
                <input type="checkbox" checked={a.pivotal} onChange={(e) => setAch(i, { pivotal: e.target.checked })} />
                <span>决定性</span>
              </label>
              <textarea
                className="ach-context"
                rows={2}
                value={a.context}
                placeholder="第三人称的史实背景（不要写第一人称内心话）"
                onChange={(e) => setAch(i, { context: e.target.value })}
              />
              <input
                className="ach-source"
                value={a.source}
                placeholder="资料来源（可留空）"
                onChange={(e) => setAch(i, { source: e.target.value })}
              />
              <button className="link-btn is-dim ach-del" onClick={() => patch({ achievements: doc.achievements.filter((_, k) => k !== i) })}>
                删除
              </button>
            </div>
          ))}
        </div>
      </section>

      <div className="editor-savebar">
        <button
          className="primary-btn"
          disabled={busy || doc.name.trim().length === 0}
          onClick={async () => {
            const saved = await saveLife(doc, isNew)
            if (saved) onClose()
          }}
        >
          {busy ? '保存中…' : '保存并公开'}
        </button>
        <span>{doc.achievements.length} 条成就 · {doc.journeys.length} 段旅程 · {doc.published ? '公开' : '已撤下'}</span>
      </div>
    </div>
  )
}

function precision(when: string): 'year' | 'month' | 'day' | 'unknown' {
  const w = when.trim()
  if (/^-?\d{1,4}$/.test(w)) return 'year'
  if (/^-?\d{1,4}-\d{1,2}$/.test(w)) return 'month'
  if (/^-?\d{1,4}-\d{1,2}-\d{1,2}$/.test(w)) return 'day'
  return 'unknown'
}

export { precision }
