import { useEffect, useRef, useState } from 'react'
import type { SnapshotInfo } from '../data/repository'
import { formatAgo } from '../core/types'
import { useLife } from '../state/store'
import { dateStamp, downloadText } from './Hud'

/**
 * 档案
 * ---------------------------------------------------------------------------
 * 这一屏存在的唯一理由是让人安心：东西在哪里、有没有存住、怎么带走。
 * 星履不做云同步，也不做账号 —— 本地优先本身就是最强的可靠性。
 */

export function ArchiveSheet() {
  const open = useLife((s) => s.settingsOpen)
  const setOpen = useLife((s) => s.setSettingsOpen)
  const universe = useLife((s) => s.universe)
  const storageMode = useLife((s) => s.storageMode)
  const lastSavedAt = useLife((s) => s.lastSavedAt)
  const quality = useLife((s) => s.quality)
  const setQuality = useLife((s) => s.setQuality)
  const exportText = useLife((s) => s.exportText)
  const importArchive = useLife((s) => s.importArchive)
  const loadSample = useLife((s) => s.loadSample)
  const wipeAll = useLife((s) => s.wipeAll)
  const restoreSnapshot = useLife((s) => s.restoreSnapshot)

  const fileRef = useRef<HTMLInputElement>(null)
  const [snapshots, setSnapshots] = useState<SnapshotInfo[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [confirmWipe, setConfirmWipe] = useState(false)

  useEffect(() => {
    if (!open) return
    let alive = true
    void useLife
      .getState()
      .repo.listSnapshots()
      .then((list) => {
        if (alive) setSnapshots(list)
      })
    return () => {
      alive = false
    }
  }, [open, lastSavedAt, universe.stats.total])

  if (!open) return null

  const stats = universe.stats

  return (
    <section className="panel sheet" aria-label="档案">
      <header className="panel-head">
        <div>
          <div className="panel-title">档案</div>
          <div className="panel-sub">
            {stats.total} 颗星 · {stats.journeyCount} 段旅程 · {stats.constellationCount} 个星座
          </div>
        </div>
        <button className="close-x" onClick={() => setOpen(false)}>
          ✕
        </button>
      </header>

      <div className="sheet-list">
        <div className="row">
          <div className="row-main">
            <div className="row-title">存放位置</div>
            <div className="row-desc">
              {storageMode === 'indexeddb'
                ? '浏览器本地数据库（IndexedDB）+ localStorage 镜像。不联网，不上传。'
                : '这台浏览器不允许本地数据库，内容只存在内存里 —— 请用下面的导出功能保底。'}
            </div>
          </div>
          <div className="row-action">
            <span className={`dot${storageMode === 'memory' ? ' is-rose' : ' is-amber'}`} />
          </div>
        </div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">最近一次归档</div>
            <div className="row-desc">{lastSavedAt ? formatAgo(lastSavedAt) : '还没有归档过'}</div>
          </div>
        </div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">导出到文件</div>
            <div className="row-desc">一份可读的 JSON。换电脑、换浏览器，或者只是想把人生握在手里。</div>
          </div>
          <div className="row-action">
            <button
              className="ghost-btn"
              onClick={() => {
                downloadText(exportText(), `星履-档案-${dateStamp()}.json`)
                setMessage('档案已导出到下载目录。')
              }}
            >
              导出
            </button>
          </div>
        </div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">从文件导入</div>
            <div className="row-desc">按 id 合并：同一条经历保留更新时间较新的那一版。</div>
          </div>
          <div className="row-action">
            <button className="ghost-btn" onClick={() => fileRef.current?.click()}>
              选择文件
            </button>
          </div>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json,.xinglv"
          style={{ display: 'none' }}
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            try {
              const text = await file.text()
              const res = await importArchive(text, 'merge')
              setMessage(res.ok ? `已导入，现在共有 ${res.count} 颗星。` : (res.error ?? '导入失败'))
            } catch (err) {
              setMessage(err instanceof Error ? err.message : '读取文件失败')
            }
          }}
        />

        <div className="row">
          <div className="row-main">
            <div className="row-title">历史快照</div>
            <div className="row-desc">
              {snapshots.length === 0
                ? '每次正式归档前都会自动留下一份上一版，最多保留 5 份。'
                : '每次正式归档前自动留下，最多 5 份。删掉的星也可以在这里找回。'}
            </div>
          </div>
        </div>
        {snapshots.map((s) => (
          <div className="row" key={s.key}>
            <div className="row-main">
              <div className="row-title">{formatAgo(s.savedAt)}</div>
              <div className="row-desc">{s.achievements} 颗星</div>
            </div>
            <div className="row-action">
              <button
                className="ghost-btn"
                onClick={async () => {
                  const ok = await restoreSnapshot(s.key)
                  setMessage(ok ? '已回到这份快照。' : '恢复失败')
                }}
              >
                恢复
              </button>
            </div>
          </div>
        ))}

        <div className="row">
          <div className="row-main">
            <div className="row-title">画面精细度</div>
            <div className="row-desc">越高越沉浸，也越吃显卡。星履会在卡顿时自动降一档。</div>
          </div>
          <div className="row-action" style={{ display: 'flex', gap: 6 }}>
            {(['low', 'balanced', 'high'] as const).map((q) => (
              <button key={q} className={`ghost-btn${quality === q ? ' is-on' : ''}`} onClick={() => setQuality(q)}>
                {q === 'low' ? '流畅' : q === 'balanced' ? '均衡' : '沉浸'}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <div className="row-main">
            <div className="row-title">示例星河</div>
            <div className="row-desc">一段虚构的人生，用来看看这片星空长什么样。它会覆盖当前档案。</div>
          </div>
          <div className="row-action">
            <button className="ghost-btn" onClick={() => void loadSample()}>
              载入
            </button>
          </div>
        </div>

        <div className="row" style={{ borderBottom: 'none' }}>
          <div className="row-main">
            <div className="row-title">清空星空</div>
            <div className="row-desc">先自动留一份快照，所以并不是不可逆。</div>
          </div>
          <div className="row-action" style={{ display: 'flex', gap: 8 }}>
            {confirmWipe ? (
              <>
                <button
                  className="ghost-btn danger"
                  onClick={async () => {
                    await wipeAll()
                    setConfirmWipe(false)
                    setMessage('已清空，上一版留在历史快照里。')
                  }}
                >
                  确认清空
                </button>
                <button className="ghost-btn" onClick={() => setConfirmWipe(false)}>
                  取消
                </button>
              </>
            ) : (
              <button className="ghost-btn" onClick={() => setConfirmWipe(true)}>
                清空
              </button>
            )}
          </div>
        </div>

        {message ? (
          <div className="status-note" style={{ marginTop: 14, borderLeftColor: 'var(--cyan)' }}>
            {message}
          </div>
        ) : null}
      </div>
    </section>
  )
}
