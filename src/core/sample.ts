import type { Archive, Achievement, DomainId, Importance, Journey, Resonance } from './types'
import { SCHEMA_VERSION } from './types'

/**
 * 示例星河 —— 只用于「先看看一片星河长什么样」。
 * 它始终被明确标注为示例，一键可清空；它不是任何人的真实人生。
 * 日期按「现在」相对生成，所以无论什么时候打开，它都是一段刚刚走到今天的人生。
 */

interface Seed {
  /** 距今多少年 */
  y: number
  m: number
  d: number
  title: string
  reflection: string
  domain: DomainId
  imp: Importance
  res: Resonance
  journey?: string
  witnesses?: string[]
}

const SEEDS: Seed[] = [
  {
    y: 8, m: 6, d: 18, title: '高考结束，拿到录取通知书', domain: 'academy', imp: 4, res: 5,
    reflection: '家里第一次为我放了鞭炮。我拿着那张纸在巷口站了很久，觉得人生终于要开始了 —— 后来才知道，那只是开始迷路。',
    witnesses: ['妈妈', '爸爸'],
  },
  {
    y: 8, m: 9, d: 3, title: '第一次离开家，去一千公里外的城市', domain: 'journey', imp: 3, res: 4,
    reflection: '火车开了十四个小时。我把脸贴在窗上，第一次意识到「家」是一个会离开的地方。',
    journey: '第一次一个人上路',
  },
  {
    y: 8, m: 10, d: 21, title: '发现自己不喜欢这个专业', domain: 'academy', imp: 3, res: 1,
    reflection: '上完第三节课我就知道了。那天晚上我在操场走了很多圈，不敢跟任何人说。',
  },
  {
    y: 7, m: 3, d: 12, title: '写下第一行能跑的代码', domain: 'craft', imp: 3, res: 1,
    reflection: '一个绿色的小方块在黑色窗口里跳了一下。我盯着它看了十分钟，心里有一种很安静的高兴。',
    journey: '从零开始写代码',
  },
  {
    y: 7, m: 8, d: 2, title: '在图书馆通宵做完第一个小项目', domain: 'craft', imp: 3, res: 1,
    reflection: '凌晨四点，保安来赶人。我抱着电脑走在回宿舍的路上，第一次觉得自己也许能做点什么。',
    journey: '从零开始写代码',
  },
  {
    y: 7, m: 11, d: 27, title: '第一次拿到实习 offer', domain: 'career', imp: 4, res: 4,
    reflection: '邮件里只有三行字，我读了二十遍。给妈妈打电话的时候声音在抖，她说「你慢点说」。',
    witnesses: ['妈妈'],
    journey: '从转行到靠它生活',
  },
  {
    y: 6, m: 4, d: 9, title: '一个人坐了通宵硬座去看海', domain: 'journey', imp: 4, res: 2,
    reflection: '天快亮的时候我到了。海比我想的安静得多。我在堤坝上坐了三个小时，什么都没想。',
    journey: '第一次一个人上路',
  },
  {
    y: 6, m: 9, d: 15, title: '认识了她', domain: 'relation', imp: 5, res: 3,
    reflection: '她说她喜欢在雨天走很长的路。那天我们绕了半个城，走回去的时候鞋全湿了。',
    witnesses: ['她'],
  },
  {
    y: 6, m: 12, d: 1, title: '开始每天记一点东西', domain: 'creation', imp: 3, res: 1,
    reflection: '最初只是为了不忘记。后来发现，写下这件事本身，就是在把日子过第二遍。',
    journey: '写字这件事',
  },
  {
    y: 5, m: 3, d: 20, title: '第一次因为写的东西被人认真读完', domain: 'creation', imp: 4, res: 4,
    reflection: '一个陌生人给我留了很长的评论，说他也有过一样的夜晚。我在工位上偷偷红了眼睛。',
    journey: '写字这件事',
  },
  {
    y: 5, m: 7, d: 8, title: '毕业，行李只有两个箱子', domain: 'academy', imp: 4, res: 5,
    reflection: '宿舍空了以后我回头看了一眼，四年的东西装在两个箱子里，还有一箱子书寄回了家。',
    witnesses: ['室友'],
  },
  {
    y: 5, m: 8, d: 1, title: '正式入职，第一份工作', domain: 'career', imp: 5, res: 5,
    reflection: '工牌上印着我的名字。那天我加班到很晚，但一点都不觉得累。',
    journey: '从转行到靠它生活',
    witnesses: ['同事'],
  },
  {
    y: 5, m: 11, d: 16, title: '第一次线上事故，我写的代码', domain: 'craft', imp: 4, res: 3,
    reflection: '凌晨两点被电话叫醒，手是冷的。修完以后我在楼道坐了很久 —— 原来「负责」是这个重量。',
    journey: '从零开始写代码',
  },
  {
    y: 4, m: 2, d: 27, title: '搬进第一间自己租的房子', domain: 'family', imp: 3, res: 2,
    reflection: '三十平米，窗户朝东。我买了一盏很暖的灯，晚上开着它做饭。',
  },
  {
    y: 4, m: 5, d: 4, title: '开始跑步，第一次跑完五公里', domain: 'health', imp: 3, res: 1,
    reflection: '停下来的时候肺在烧，但心里特别亮。那是我第一次觉得身体是我的。',
    journey: '把身体找回来',
  },
  {
    y: 4, m: 9, d: 11, title: '奶奶走了', domain: 'family', imp: 5, res: 5,
    reflection: '我赶回去的时候她已经不认得人了。她最后叫的是我的小名。我到现在还会梦到她在厨房。',
    journey: '和家人的第二次靠近',
    witnesses: ['爸爸', '妈妈', '姑姑'],
  },
  {
    y: 4, m: 11, d: 23, title: '第一次一个人过生日', domain: 'relation', imp: 2, res: 0,
    reflection: '买了一个很小的蛋糕，插了一根蜡烛，自己唱完歌吹了。也挺好的。',
  },
  {
    y: 3, m: 3, d: 6, title: '被裁员', domain: 'career', imp: 5, res: 3,
    reflection: 'HR 说完那句话之后，走廊里的灯好像都暗了一点。我在地铁上想的是：要怎么跟家里说。',
    journey: '从转行到靠它生活',
  },
  {
    y: 3, m: 4, d: 19, title: '连着两个月没有面试通过', domain: 'career', imp: 4, res: 1,
    reflection: '最糟的不是没钱，是每天早上醒来不知道该干什么。我开始每天固定时间出门，假装去上班。',
    journey: '从转行到靠它生活',
  },
  {
    y: 3, m: 6, d: 2, title: '开始睡不好，去看了一次医生', domain: 'health', imp: 4, res: 2,
    reflection: '医生说是焦虑引起的。他问我「你最近有什么事是让你放松的吗」，我答不上来。',
    journey: '把身体找回来',
  },
  {
    y: 3, m: 8, d: 14, title: '重新开始投简历，第 41 封', domain: 'career', imp: 4, res: 1,
    reflection: '我把每一封被拒的邮件都留着。第 41 封之后，我开始不那么害怕被拒绝了。',
    journey: '从转行到靠它生活',
  },
  {
    y: 3, m: 10, d: 5, title: '拿到现在这份工作', domain: 'career', imp: 5, res: 4,
    reflection: '签完字我在楼下坐了一会儿。不是因为高兴，是因为终于可以喘一口气了。',
    journey: '从转行到靠它生活',
    witnesses: ['妈妈'],
  },
  {
    y: 3, m: 12, d: 28, title: '爸爸第一次跟我说「你辛苦了」', domain: 'family', imp: 5, res: 3,
    reflection: '我们二十多年没说过这种话。他在电话那头沉默了很久，我在这一头也是。',
    journey: '和家人的第二次靠近',
    witnesses: ['爸爸'],
  },
  {
    y: 2, m: 4, d: 17, title: '开始写自己的东西，不再只是工作', domain: 'creation', imp: 4, res: 2,
    reflection: '我给自己定了一个规矩：每周必须写一篇不为了任何人的东西。',
    journey: '写字这件事',
  },
  {
    y: 2, m: 7, d: 30, title: '和她分开了', domain: 'relation', imp: 5, res: 4,
    reflection: '我们一起把书分完，一人一半。她走的时候我没有送到楼下 —— 我怕我送到楼下就说不出口了。',
  },
  {
    y: 2, m: 9, d: 12, title: '搬到一个有海的城市', domain: 'journey', imp: 4, res: 3,
    reflection: '搬家那天下了雨。新房子离海三公里，我第一次在阳台上闻到了咸的味道。',
    journey: '第一次一个人上路',
  },
  {
    y: 2, m: 11, d: 6, title: '在海边晨跑，连续第 100 天', domain: 'health', imp: 4, res: 2,
    reflection: '第一百天我在沙滩上坐了很久。原来所谓改变，就是某一天你不再需要说服自己。',
    journey: '把身体找回来',
  },
  {
    y: 1, m: 2, d: 21, title: '开始做自己的产品', domain: 'craft', imp: 5, res: 2,
    reflection: '第一个晚上我写了一页纸的计划，然后删掉了大半。剩下的三行到现在还在用。',
    journey: '从零开始写代码',
  },
  {
    y: 1, m: 5, d: 9, title: '第一次有人为它付钱', domain: 'career', imp: 5, res: 4,
    reflection: '金额很小。但那一刻我知道，我做的事对某个陌生人是有用的。',
    journey: '从转行到靠它生活',
  },
  {
    y: 1, m: 7, d: 15, title: '和妈妈打了一个两小时的电话', domain: 'family', imp: 4, res: 2,
    reflection: '我们聊的都是很小的事。挂电话前她说「你最近声音好听了」。',
    journey: '和家人的第二次靠近',
    witnesses: ['妈妈'],
  },
  {
    y: 1, m: 9, d: 27, title: '一个陌生人写邮件说，我的文字陪他过了很难的一年', domain: 'creation', imp: 5, res: 4,
    reflection: '我看了三遍才回。原来我以为只是写给自己的东西，真的会走到别人那里去。',
    journey: '写字这件事',
  },
  {
    y: 0, m: 1, d: 14, title: '第一次把产品公开给陌生人用', domain: 'craft', imp: 5, res: 5,
    reflection: '发布按钮按下去之后，我手心全是汗。有人用，有人骂，有人留下了建议。',
    journey: '从零开始写代码',
    witnesses: ['朋友', '陌生人'],
  },
  {
    y: 0, m: 3, d: 22, title: '重新读了一遍自己八年前写的东西', domain: 'academy', imp: 4, res: 1,
    reflection: '那个在操场上绕圈、不敢跟人说话的男生，好像没有走远。但他确实往前走了很多。',
  },
  {
    y: 0, m: 5, d: 8, title: '决定把每天记的东西整理成一本书', domain: 'creation', imp: 4, res: 2,
    reflection: '不是为了出版。是想给自己一个交代：这些年，我确实认真活过。',
    journey: '写字这件事',
  },
  {
    y: 0, m: 0, d: 18, title: '今天，我把它记了下来', domain: 'creation', imp: 3, res: 1,
    reflection: '没有发生什么大事。但我想留下这一天。',
  },
]

function dateFrom(yearsAgo: number, month: number, day: number, now: Date): string {
  const d = new Date(now.getFullYear() - yearsAgo, Math.max(0, month - 1), day, 12, 0, 0)
  if (d.getTime() > now.getTime()) d.setFullYear(d.getFullYear() - 1)
  const y = d.getFullYear()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${dd}`
}

export function sampleArchive(now = new Date()): Archive {
  const journeyNames = [...new Set(SEEDS.map((s) => s.journey).filter((x): x is string => !!x))]
  const journeys: Journey[] = journeyNames.map((name, i) => ({
    id: `jr_sample_${i}`,
    name,
    createdAt: new Date(now.getFullYear() - 8, 0, 1).toISOString(),
  }))
  const journeyIdByName = new Map(journeys.map((j) => [j.name, j.id]))

  const achievements: Achievement[] = SEEDS.map((s, i) => {
    const when = dateFrom(s.y, s.m, s.d, now)
    return {
      id: `ach_sample_${String(i).padStart(3, '0')}`,
      title: s.title,
      happenedAt: when,
      reflection: s.reflection,
      domain: s.domain,
      importance: s.imp,
      resonance: s.res,
      witnesses: s.witnesses,
      journeyId: s.journey ? journeyIdByName.get(s.journey) : undefined,
      createdAt: `${when}T12:00:00.000Z`,
      updatedAt: `${when}T12:00:00.000Z`,
      schemaVersion: SCHEMA_VERSION,
    }
  }).sort((a, b) => (a.happenedAt < b.happenedAt ? -1 : 1))

  return {
    schemaVersion: SCHEMA_VERSION,
    achievements,
    journeys,
    createdAt: new Date(now.getFullYear() - 8, 0, 1).toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export const SAMPLE_JOURNEY_NAMES = [...new Set(SEEDS.map((s) => s.journey).filter((x): x is string => !!x))]

/**
 * 这份档案是不是那片刻意准备的示例星河？
 * ---------------------------------------------------------------------------
 * 靠 id 判断：示例的 id 是确定性的（`ach_sample_xxx` / `jr_sample_x`），
 * 所以不需要往数据结构里加标记位 —— 加标记位就得在每个写入路径上记得清掉，漏一处就会说谎。
 *
 * 为什么需要它：示例和「你自己的星空」在画面上长得一样，用户很容易以为
 * 「我的记录被示例顶掉了」。有了这个判断，界面就能直说「你正在看的是示例」，
 * 并且给一个一键退回自己星空的出口。
 */
export function isSampleArchive(archive: { achievements: Array<{ id: string }> } | null | undefined): boolean {
  if (!archive || archive.achievements.length === 0) return false
  return archive.achievements.every((a) => a.id.startsWith('ach_sample_'))
}
