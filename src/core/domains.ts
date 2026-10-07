import type { DomainId } from './types'

/**
 * 九个领域 + 一个未归类。
 *
 * 配色原则（全站统一）：低饱和深空色彩，避免廉价蓝紫霓虹。
 * 深靛蓝 / 雾青 / 冷白 / 暗紫灰 / 琥珀金 / 淡玫瑰 六色为基底，向各领域延展。
 */
export interface DomainDef {
  id: DomainId
  label: string
  short: string
  /** sRGB 十六进制 */
  color: string
  /** 星云/星座的辅助色 */
  accent: string
  /** 关键词：用于「先留下，再完善」时的自动归类 */
  keywords: string[]
  /** 一句人话解释这个领域 */
  blurb: string
}

export const DOMAINS: DomainDef[] = [
  {
    id: 'academy',
    label: '学业',
    short: '学',
    color: '#a8c2d8',
    accent: '#5b7fa3',
    blurb: '读书、考试、毕业、学位、课程',
    keywords: [
      '学', '考', '试', '毕业', '升学', '录取', '学位', '论文', '答辩', '研究生', '大学', '高中', '初中', '小学',
      '课程', '成绩', '奖学金', '留学', '申请', '答辩', '硕士', '博士', '考试', '证书', '资格',
    ],
  },
  {
    id: 'craft',
    label: '技术',
    short: '技',
    color: '#71a8b5',
    accent: '#3c6d7a',
    blurb: '写下的代码、做出来的东西、掌握的手艺',
    keywords: [
      '代码', '编程', '开发', '项目', '上线', '重构', '算法', '架构', '开源', '调试', 'bug', '技术', '工程',
      'stack', 'github', 'git', '部署', '性能', '系统', '框架', '数据库', '模型', '训练', 'ai', '设计稿',
    ],
  },
  {
    id: 'career',
    label: '事业',
    short: '业',
    color: '#c99a5b',
    accent: '#8a6836',
    blurb: '工作、创业、升职、转行、第一次被认可',
    keywords: [
      '工作', '公司', '入职', '离职', '升职', '加薪', '创业', '转行', '面试', '实习', 'offer', '客户',
      '融资', '团队', '合伙', '名片', '副业', '自由职业', '辞职', '跳槽', '绩效', '主管', '经理',
    ],
  },
  {
    id: 'relation',
    label: '关系',
    short: '人',
    color: '#c08e9c',
    accent: '#7d5a66',
    blurb: '遇见的人、在一起、分开、和解',
    keywords: [
      '朋友', '恋人', '喜欢', '告白', '在一起', '分手', '结婚', '遇见', '认识', '告白', '陪伴', '老师',
      '导师', '同事', '伙伴', '和解', '道歉', '告别', '谢谢', '思念', '他', '她', '爱情', '友情',
    ],
  },
  {
    id: 'journey',
    label: '旅行',
    short: '行',
    color: '#7fa79a',
    accent: '#4f7267',
    blurb: '去过的地方、走过的路、看过的天空',
    keywords: [
      '旅行', '旅游', '出发', '出发', '抵达', '城市', '国家', '飞机', '火车', '徒步', '露营', '海', '山',
      '签证', '背包', '自驾', '骑行', '环球', '第一次出国', '搬迁', '搬家', '新城市',
    ],
  },
  {
    id: 'passion',
    label: '兴趣',
    short: '趣',
    color: '#bf8a6e',
    accent: '#7f5a45',
    blurb: '纯粹因为喜欢而做的事',
    keywords: [
      '爱好', '兴趣', '音乐', '吉他', '钢琴', '画画', '摄影', '运动', '球', '跑步', '游泳', '攀岩', '游戏',
      '读书', '电影', '演出', '演唱会', '展览', '收藏', '做饭', '咖啡', '茶', '手作', '乐器', '乐队',
    ],
  },
  {
    id: 'family',
    label: '家庭',
    short: '家',
    color: '#9a86a8',
    accent: '#5f5170',
    blurb: '家人、孩子、父母、家里的事',
    keywords: [
      '家', '父母', '妈妈', '爸爸', '爷爷', '奶奶', '外公', '外婆', '孩子', '女儿', '儿子', '出生', '怀孕',
      '结婚', '搬家', '亲人', '去世', '离开', '团聚', '过年', '照顾', '陪',
    ],
  },
  {
    id: 'health',
    label: '健康',
    short: '健',
    color: '#8fae87',
    accent: '#5a7355',
    blurb: '身体、恢复、戒掉、重新站起来',
    keywords: [
      '健康', '身体', '生病', '手术', '住院', '康复', '恢复', '戒', '减肥', '体重', '睡眠', '失眠', '焦虑',
      '抑郁', '心理', '治疗', '体检', '跑步', '健身', '早睡', '手术', '复发', '好转',
    ],
  },
  {
    id: 'creation',
    label: '创作',
    short: '创',
    color: '#9098c8',
    accent: '#5b6291',
    blurb: '写下的、做出的、留下来的作品',
    keywords: [
      '写', '创作', '小说', '文章', '博客', '诗集', '歌', '专辑', '发布', '作品', '出版', 'repo', '绘画',
      '视频', '播客', '设计', '书', '稿', '记录', '演讲', '分享', '公开',
    ],
  },
  {
    id: 'unfiled',
    label: '未归类',
    short: '·',
    color: '#7b8aa0',
    accent: '#4a5666',
    blurb: '还没想好属于哪里；它同样值得被点亮',
    keywords: [],
  },
]

const DOMAIN_BY_ID: Record<DomainId, DomainDef> = DOMAINS.reduce(
  (acc, d) => {
    acc[d.id] = d
    return acc
  },
  {} as Record<DomainId, DomainDef>,
)

export function domainDef(id: DomainId): DomainDef {
  return DOMAIN_BY_ID[id] ?? DOMAIN_BY_ID.unfiled
}

/** 除「未归类」之外的领域顺序，用于星图分臂。 */
export const CORE_DOMAINS: DomainId[] = DOMAINS.filter((d) => d.id !== 'unfiled').map((d) => d.id)
export const DOMAIN_INDEX: Record<string, number> = DOMAINS.reduce(
  (acc, d, i) => {
    acc[d.id] = i
    return acc
  },
  {} as Record<string, number>,
)
export const DOMAIN_COUNT = DOMAINS.length

/**
 * 从文字里推回一个领域 —— 只是为了「先留下，再完善」时不让用户先选分类。
 * 这是本地启发式，不联网；用户随时可以改。
 */
export function inferDomain(text: string): { domain: DomainId; score: number } {
  const t = text.toLowerCase()
  if (!t.trim()) return { domain: 'unfiled', score: 0 }
  let best: DomainId = 'unfiled'
  let bestScore = 0
  for (const d of DOMAINS) {
    if (d.id === 'unfiled') continue
    let score = 0
    for (const kw of d.keywords) {
      const k = kw.toLowerCase()
      if (!k) continue
      const hits = countOccurrences(t, k)
      if (hits > 0) score += hits * (k.length >= 2 ? 2.2 : 1)
    }
    if (score > bestScore) {
      bestScore = score
      best = d.id
    }
  }
  if (bestScore < 2) return { domain: 'unfiled', score: bestScore }
  return { domain: best, score: bestScore }
}

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0
  let i = 0
  let n = 0
  for (;;) {
    const at = hay.indexOf(needle, i)
    if (at < 0) break
    n++
    i = at + needle.length
    if (n > 6) break
  }
  return n
}

/** sRGB → 线性空间。着色器里做加法叠加，必须用线性值才不会发灰。 */
export function srgbToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const f = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return [f(r), f(g), f(b)]
}

export function domainLinear(id: DomainId): [number, number, number] {
  return srgbToLinear(domainDef(id).color)
}

export function domainAccentLinear(id: DomainId): [number, number, number] {
  return srgbToLinear(domainDef(id).accent)
}
