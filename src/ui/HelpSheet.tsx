import { useLife } from '../state/store'

/** 怎么用 —— 只讲必要的东西，不用产品语气说教 */

export function HelpSheet() {
  const open = useLife((s) => s.helpOpen)
  const setOpen = useLife((s) => s.setHelpOpen)
  if (!open) return null

  return (
    <section className="panel sheet" aria-label="怎么用">
      <header className="panel-head">
        <div>
          <div className="panel-title">这片星空怎么用</div>
          <div className="panel-sub">三句话就够</div>
        </div>
        <button className="close-x" onClick={() => setOpen(false)}>
          ✕
        </button>
      </header>
      <div className="sheet-list">
        <div className="row" style={{ display: 'block' }}>
          <div className="row-title">一 · 一颗星＝一次真实的经历</div>
          <div className="row-desc" style={{ marginTop: 6 }}>
            学业、技术、事业、关系、旅行、兴趣、家庭、健康、创作 —— 颜色只说明它属于人生的哪一部分。
            星体大小是你自己定的重要程度；亮度与外辉表达它被多少人知道、理解、见证。
            这里没有点赞，价值不由任何计数器决定。
          </div>
        </div>
        <div className="row" style={{ display: 'block' }}>
          <div className="row-title">二 · 先留下，再完善</div>
          <div className="row-desc" style={{ marginTop: 6 }}>
            首屏只问“发生了什么、什么时候、为什么它对你重要”。其余都可以以后补。
            每次输入都会同步暂存在本机；归档失败也不会清空任何东西，可以随时重试。
          </div>
        </div>
        <div className="row" style={{ display: 'block' }}>
          <div className="row-title">三 · 时间不是筛选器</div>
          <div className="row-desc" style={{ marginTop: 6 }}>
            右侧的时间轴是宇宙本身的一维。往下拉，未来的星会逐渐熄灭、光晕收缩、星轨消散，
            你会真的看见“当年的我拥有怎样的星空”。未来区域始终保持黑暗与未知。
          </div>
        </div>
        <div className="row" style={{ display: 'block', borderBottom: 'none' }}>
          <div className="row-title">手势</div>
          <div className="row-desc" style={{ marginTop: 6 }}>
            拖动环绕 · 滚轮或双指缩放 · 右键／双指拖动平移 · 单击一颗星读它的故事 ·
            再次点击空白处返回原来的位置 · 双击空白看整片星河 · Esc 收起当前面板。
          </div>
        </div>
      </div>
    </section>
  )
}
