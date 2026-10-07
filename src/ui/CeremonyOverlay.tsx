import { useEffect, useState } from 'react'
import { useLife } from '../state/store'

/**
 * 诞生仪式的文字层
 * ---------------------------------------------------------------------------
 * 只在一处出现一句话，而且很晚才出现。
 * 仪式的重量应该来自光和镜头，不来自文字；更不能出现任何游戏化的表达。
 */

export function CeremonyOverlay() {
  const ceremony = useLife((s) => s.ceremony)
  const finishCeremony = useLife((s) => s.finishCeremony)
  const justBornStarId = useLife((s) => s.justBornStarId)
  const clearJustBorn = useLife((s) => s.clearJustBorn)
  const focusStar = useLife((s) => s.focusStar)
  const universe = useLife((s) => s.universe)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!ceremony) {
      setElapsed(0)
      return
    }
    const start = performance.now()
    const id = window.setInterval(() => setElapsed((performance.now() - start) / 1000), 200)
    return () => window.clearInterval(id)
  }, [ceremony])

  useEffect(() => {
    if (!justBornStarId) return
    const t = window.setTimeout(() => clearJustBorn(), 16000)
    return () => window.clearTimeout(t)
  }, [justBornStarId, clearJustBorn])

  const bornStar = justBornStarId ? universe.stars[universe.byId.get(justBornStarId) ?? -1] : undefined

  return (
    <>
      {ceremony ? (
        <>
          {elapsed > 5.4 && elapsed < 9.4 ? (
            <div className="ceremony-caption">
              <div className="line">它已经成为你星河的一部分</div>
              <div className="title">{universe.stars[universe.byId.get(ceremony.starId) ?? -1]?.achievement.title ?? ''}</div>
            </div>
          ) : null}
          {elapsed > 2.6 ? (
            <button className="ceremony-skip" onClick={finishCeremony}>
              跳过
            </button>
          ) : null}
        </>
      ) : null}

      {!ceremony && bornStar ? (
        <div className="just-born">
          <span className="t">刚刚点亮 · {bornStar.achievement.title}</span>
          <button className="link-btn" onClick={() => focusStar(bornStar.id)}>
            读一读
          </button>
          <button className="close-x" style={{ fontSize: 13 }} onClick={clearJustBorn} title="收起">
            ✕
          </button>
        </div>
      ) : null}
    </>
  )
}
