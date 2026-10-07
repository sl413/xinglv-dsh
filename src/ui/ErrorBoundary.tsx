import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 星履 · 顶层错误边界
 * ---------------------------------------------------------------------------
 * 为什么必须有它：这是一个**在浏览器里存着用户一生记录**的应用。
 * 之前没有任何错误边界 —— 任何一处渲染异常都会变成整页白屏，
 * 而白屏的人第一反应是「我的记录是不是没了」。
 *
 * 底线是**说实话**：数据还在浏览器里（本地数据库没被动过），
 * 所以这里必须说清楚这一点，并给出「导出备份」和「重新加载」两个出口。
 */
interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 控制台留一份完整堆栈，方便排查（生产环境也不会有人看，但排查时救命）
    console.error('[星履] 界面渲染出错：', error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  /** 直接从存储层导出：不依赖任何组件是否还能渲染 */
  private exportBackup = async () => {
    try {
      const mod = await import('../data/repository')
      const loaded = await mod.repository.loadArchive()
      if (!loaded?.archive) {
        window.alert('读不到档案（可能本机存储不可用）。记录没有被动过，请不要清理浏览器数据。')
        return
      }
      const text = mod.repository.exportBundle(loaded.archive)
      const blob = new Blob([text], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `星履-档案-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      window.alert(`导出没成功：${err instanceof Error ? err.message : String(err)}\n\n内容仍然在你本机的浏览器数据库里，不要清浏览器数据。`)
    }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="fatal">
        <div className="fatal-card">
          <h1>界面出了点问题</h1>
          <p>
            <strong>你的记录还在。</strong>它们保存在这个浏览器的本地数据库里，这次出错没有动过它们 —— 所以
            <strong>先不要清理浏览器数据</strong>。
          </p>
          <p className="fatal-detail">{this.state.error.message}</p>
          <div className="fatal-actions">
            <button className="primary-btn" onClick={() => window.location.reload()}>
              重新加载
            </button>
            <button className="ghost-btn" onClick={() => void this.exportBackup()}>
              导出档案保底
            </button>
          </div>
          <details>
            <summary>技术细节</summary>
            <pre>{this.state.info.slice(0, 2000)}</pre>
          </details>
        </div>
      </div>
    )
  }
}
