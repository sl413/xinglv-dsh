/** 界面上反复出现的说法，集中一处，保证同一种价值判断在哪儿都说同一句话。 */

export const IMPORTANCE_LABEL = ['', '轻轻记一笔', '对我有点分量', '很重要', '改变了我的一段路', '改变了我的一生']

export const RESONANCE_LABEL = [
  '只有我自己知道',
  '有一个人知道',
  '少数几个人知道',
  '一群人知道',
  '很多人知道',
  '被许多人共同见证',
]

export const RESONANCE_HINT = '被理解、被见证的程度 —— 它不由点赞数决定'

export const EMPTY_STORY_HINT = '这颗星还没有故事。你随时可以补上：那时候你为什么在意它。'

export function importanceLabel(n: number): string {
  return IMPORTANCE_LABEL[Math.max(0, Math.min(5, Math.round(n)))]
}

export function resonanceLabel(n: number): string {
  return RESONANCE_LABEL[Math.max(0, Math.min(5, Math.round(n)))]
}

/**
 * 群星列传里不能用「改变了我的一段路」这种第一人称说法 —— 那是用户自己的话。
 * 这里换成对公开成就的事实性描述，并且明确它是编辑规则而不是评价。
 */
export function guestImportanceLabel(n: number): string {
  return n >= 4 ? '决定性成就' : '公开成就'
}
