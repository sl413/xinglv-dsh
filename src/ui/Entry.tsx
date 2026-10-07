import { navigate } from '../core/router'
import { useLife } from '../state/store'

/**
 * 第一次进入
 * ---------------------------------------------------------------------------
 * 不弹教程、不做分步引导。只说清楚两件事：
 * 这里是什么，以及你可以从哪儿开始。
 */

export function Entry() {
  const entered = useLife((s) => s.entered)
  const phase = useLife((s) => s.phase)
  const enter = useLife((s) => s.enter)
  const openComposer = useLife((s) => s.openComposer)
  const loadSample = useLife((s) => s.loadSample)
  const total = useLife((s) => s.archive.achievements.length)
  const composerOpen = useLife((s) => s.composerOpen)

  if (entered || total > 0 || phase === 'loading' || composerOpen) return null

  return (
    <div className="entry">
      <h1>星履</h1>
      <div className="tagline">让走过的每一步，都在星空中留下光</div>
      <div className="body">
        这里没有待办、没有打卡、没有点赞。
        <br />
        你每记下一次真实的经历、一个成长节点、一件对自己有意义的改变，
        <br />
        三维人生星空中就会真的亮起一颗星。
        <br />
        <br />
        学业、技术、事业、关系、旅行、兴趣、家庭、健康、创作……
        <br />
        它们会慢慢连成只属于你的星座与星河。
      </div>
      <div className="choices">
        <button
          className="primary-btn"
          onClick={() => {
            enter()
            openComposer()
          }}
        >
          点亮我的第一颗星
        </button>
        <button
          className="ghost-btn"
          onClick={() => {
            enter()
            void loadSample()
          }}
        >
          先看看一片示例星河
        </button>
        <button
          className="ghost-btn"
          onClick={() => {
            enter()
            navigate({ name: 'lives' })
          }}
        >
          看看群星列传
        </button>
      </div>
      <div style={{ marginTop: 26, fontSize: 11, color: 'var(--text-ghost)', letterSpacing: '0.1em' }}>
        所有内容只保存在你自己的浏览器里，不上传、不联网
      </div>
    </div>
  )
}
