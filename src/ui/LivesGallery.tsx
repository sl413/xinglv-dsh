import { useEffect, useMemo, useState } from 'react'
import { navigate } from '../core/router'
import { useLife } from '../state/store'

/**
 * 群星列传 · 人物列表
 * ---------------------------------------------------------------------------
 * 匿名访客直接就能看，不需要登录。
 * 列表给出姓名、生卒年份、简短介绍、成就数量，并支持按姓名搜索。
 * 点一位人物就进入属于他自己的星空（/life/:id，这个地址可以直接分享）。
 */

export function LivesGallery() {
  const lives = useLife((s) => s.lives)
  const status = useLife((s) => s.livesStatus)
  const source = useLife((s) => s.livesSource)
  const error = useLife((s) => s.livesError)
  const loadLives = useLife((s) => s.loadLives)
  const admin = useLife((s) => s.admin)
  const setAdminOpen = useLife((s) => s.setAdminOpen)

  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<'name' | 'time' | 'count'>('time')

  useEffect(() => {
    if (status === 'idle') void loadLives()
  }, [status, loadLives])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = lives.filter((l) => {
      if (!q) return true
      return (
        l.name.toLowerCase().includes(q) ||
        (l.tagline ?? '').toLowerCase().includes(q) ||
        String(l.birthYear ?? '').includes(q) ||
        String(l.deathYear ?? '').includes(q)
      )
    })
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
    else if (sort === 'count') sorted.sort((a, b) => b.achievementCount - a.achievementCount)
    else sorted.sort((a, b) => (a.birthYear ?? 0) - (b.birthYear ?? 0))
    return sorted
  }, [lives, query, sort])

  return (
    <div className="lives-page">
      <header className="lives-head">
        <button className="ghost-btn" onClick={() => navigate({ name: 'sky' })}>
          ← 回到我的星空
        </button>
        <div className="lives-title">
          <h1>群星列传</h1>
          <p>这里收录的是别人的一生。他们不属于你，也不会和你比较 —— 只是另一片值得看一看的星空。</p>
        </div>
        <div className="lives-tools">
          <input
            className="lives-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="按姓名搜索…"
            aria-label="按姓名搜索"
          />
          <div className="lives-sort">
            <button className={sort === 'time' ? 'is-on' : ''} onClick={() => setSort('time')}>
              按年代
            </button>
            <button className={sort === 'name' ? 'is-on' : ''} onClick={() => setSort('name')}>
              按姓名
            </button>
            <button className={sort === 'count' ? 'is-on' : ''} onClick={() => setSort('count')}>
              按条目
            </button>
          </div>
          {admin ? (
            <button className="link-btn" onClick={() => { setAdminOpen(true); navigate({ name: 'admin' }) }}>
              管理名人库
            </button>
          ) : (
            <button className="link-btn is-dim" onClick={() => { setAdminOpen(true); navigate({ name: 'admin' }) }}>
              站长登录
            </button>
          )}
        </div>
      </header>

      {source === 'bundled' ? (
        <div className="lives-note">
          现在是<strong>内置名人库</strong>的只读模式：连不上应用服务器
          {error ? `（${error}）` : ''}。浏览不受影响，登录与编辑不可用。
        </div>
      ) : null}

      {status === 'loading' && lives.length === 0 ? <div className="lives-empty">正在读取名人库…</div> : null}
      {status === 'ready' && shown.length === 0 ? (
        <div className="lives-empty">{query ? `没有找到「${query}」` : '名人库还是空的。站长登录后可以加入第一位人物。'}</div>
      ) : null}

      <div className="lives-grid">
        {shown.map((life) => (
          <button key={life.id} className="life-card" onClick={() => navigate({ name: 'life', id: life.id })}>
            <div className="lc-top">
              <span className="lc-name">{life.name}</span>
              <span className="lc-span">{life.span}</span>
            </div>
            {life.fictional ? (
              // ★ 不能写死「为感受一千条成就的规模而生成」——库里已经有第二个虚构人物了
              //   （小说角色陈伶），那句话套在他头上是错的。按人物区分。
              <div className="lc-fictional">
                {life.id === 'demo-thousand'
                  ? '虚构人物 · 为感受一千条成就的规模而生成，不是史料'
                  : '虚构人物 · 剧情成就整理，不是史料'}
              </div>
            ) : null}
            <div className="lc-tag">{life.tagline}</div>
            <p className="lc-summary">{life.summary}</p>
            <div className="lc-meta">
              <span>
                <b>{life.achievementCount}</b> 条成就
              </span>
              <span>
                <b>{life.journeyCount}</b> 段旅程
              </span>
              <span className="lc-open">进入他的星空 →</span>
            </div>
          </button>
        ))}
      </div>

      <footer className="lives-foot">
        每位人物都有一个可以直接分享、刷新也能打开的网址：<code>/life/&lt;id&gt;</code>。
        <br />
        库里只收录<strong>成就</strong>（作品／著作／论文／官职／功名／工程／荣誉／讲学／育人），
        不收录生卒、疾病、婚丧、迁居与单纯的行程 —— 那些是传记事件，人物的生卒年份在资料里。
        <br />
        内容为离线整理的公开史料（年份级），未逐条核对，不作为史料引用；共鸣度不评分。
        <br />
        标为<strong>虚构人物</strong>的条目不是史料：他们只存在于小说或演示数据里，
        各自的卡片上写明了出处与整理方式。
      </footer>
    </div>
  )
}
