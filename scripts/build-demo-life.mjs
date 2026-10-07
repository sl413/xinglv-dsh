// 星履 · 虚构人物「一千条成就」生成器
// ---------------------------------------------------------------------------
// 用法：node scripts/build-demo-life.mjs
// 产出：server/seed/demo.json （服务器播种时会把它并进名人库）
//
// 为什么需要它：
//   「一千条成就的星河长什么样」这件事，只有真的放一千条进去才看得见。
//   但谁也不可能手写一千条 —— 而且**绝不能**找一位真人来编，那等于伪造史料。
//   所以这里是**明确虚构**的一个人，用固定种子程序化生成，可复现、可审查。
//
// ★ 三条自我约束
//   1. 人物是虚构的，并且被显式标注（fictional: true），
//      列表与人物星空上都会出现「虚构」标记，正文标题写「虚构记录」而不是「史实背景」。
//   2. 仍然只收录成就：论文、著作、课程、学生、地图、标本、考察、职务、合作、展览。
//      生卒、疾病、婚丧、迁居一律不进条目（生卒年记在 birthYear / deathYear）。
//   3. 固定随机种子 —— 同样的输入永远产出同样的 1000 条，方便逐条核对。
//
// 为了让一千条读起来像一个真的漫长一生，而不是一千次复制：
//   · 领域按真实比例分布，年份沿 1949–2020 铺开且密度随年龄上升；
//   · 18 个里程碑的年份是**手写**的，必须落在正确的生命阶段（考取大学不能跑到八十岁）；
//   · 标题由「地区 × 对象 × 方式」组合而成，撞了就把这一条整个重抽 ——
//     绝不靠「（续）」凑数（脚本会统计重抽失败次数，>0 就说明词库该加宽了）。

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const TOTAL = 1000
const SEED = 0x5eed1000

/* ------------------------------------------------------ 确定性随机 */

function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rnd = mulberry32(SEED)
const pick = (arr) => arr[Math.floor(rnd() * arr.length) % arr.length]
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1))

/* ------------------------------------------------------------ 词库 */

const REGIONS = [
  '横断山', '秦岭', '岷江上游', '怒江峡谷', '祁连山', '天山北坡', '长白山林区', '武夷山',
  '神农架', '南岭', '祁门山区', '大别山', '太行南麓', '黔东南', '滇西北', '青藏东缘',
  '阴山', '贺兰山', '雪峰山', '罗霄山', '无量山', '哀牢山', '高黎贡山', '白马雪山',
  '贡嘎山东坡', '邛崃山', '米仓山', '伏牛山', '天目山', '井冈山',
]

const SUBJECTS = [
  '常绿阔叶林', '高山草甸', '针阔混交林', '杜鹃灌丛', '冷杉林线', '苔藓群落', '附生植物',
  '蕨类区系', '兰科植物', '报春花属', '龙胆属', '杜鹃花属', '桦木林', '高山栎林',
  '湿地植被', '河谷灌丛', '次生林恢复', '林窗更新', '种子库', '土壤种子雨',
  '物候节律', '垂直带谱', '林线动态', '雪线变化', '放牧干扰', '火烧迹地',
  '坡向与群落', '海拔梯度', '岩石生境', '溪流岸带',
]

const METHODS = [
  '初步调查', '样方分析', '多年定点观察', '数量分类研究', '分布格局分析',
  '群落结构比较', '区系成分整理', '生长节律记录', '恢复过程追踪', '干扰响应评估',
  '遥感与地面核对', '长期样地总结', '物候谱编制', '种子萌发试验',
]

const INSTITUTIONS = [
  '西南山地生物研究所', '国立植物标本馆', '高原生态观测站', '东部植物园',
  '山区资源考察队', '林业科学研究所', '自然博物馆', '大学生命科学学院',
  '地理研究所', '植被图编纂组', '自然保护区管理局', '科学普及出版社',
  '山地环境监测中心', '植物多样性实验室', '野生植物种质库', '区域发展研究院',
  '青少年自然教育中心', '地方志编纂委员会', '生态修复工程组', '标本数字化项目组',
  '高山生态定位站', '植物学会秘书处', '自然保护基金会', '野外科学考察委员会',
]

const POSTS = [
  '助理研究员', '副研究员', '研究员', '植被研究室主任', '标本馆馆长',
  '观测站站长', '考察队队长', '期刊编委', '学会理事', '学术委员会主任', '名誉所长',
  '首席科学家', '野外指导', '特聘教授', '顾问', '主编', '评审专家', '客座研究员',
]

const AWARDS = [
  '教学成果奖', '优秀导师奖', '野外教学奖', '自然科学奖', '科技进步奖',
  '优秀科技工作者', '野外科学工作奖', '科普作品奖', '优秀论文奖', '图书奖',
  '标本收藏贡献奖', '植被制图奖', '长期观测贡献奖', '青年导师奖', '学术传播奖',
  '地方志编修奖', '生态保护贡献奖', '科学摄影奖',
]

const COURSES = [
  '植物分类学', '植被生态学', '山地植物识别', '植物地理学', '野外调查方法',
  '标本制作与鉴定', '生态学野外实习', '植被制图', '植物拉丁文', '群落调查与统计',
  '山地生态学', '植物资源学', '自然保护概论', '野外安全与急救', '科学绘图', '物候观察方法',
]

const BOOK_KINDS = [
  '植被志', '植物图志', '考察记', '野外识别手册', '研究论文集', '科普读本',
  '标本图录', '山地笔记', '植物名录', '长期样地数据集', '学术通信集', '教学讲义汇编',
]

const JOURNALS = [
  '《植物学报》', '《生态学报》', '《植物分类学报》', '《山地学报》', '《生物多样性》',
  '《植物生态学报》', '《自然资源学报》', '《高原生物学集刊》', '《植物研究》',
  '《应用生态学报》', '《西北植物学报》', '《广西植物》', '《云南植物研究》', '《生物学通报》',
]

const PARTNERS = [
  '东部植物园', '高原生态观测站', '自然博物馆', '林业科学研究所', '大学生命科学学院',
  '植被图编纂组', '邻国山地研究所', '国际山地学会', '地方自然保护区', '省级图书馆',
  '气象研究所', '土壤研究所', '地图出版社', '自然教育机构', '林业局调查队', '种质资源库',
]

const SEASONS = ['早春', '春末', '初夏', '盛夏', '初秋', '深秋', '初冬']

const ITEMS = [
  '标本夹', '烘干箱', '样方框', '海拔记录册', '种子收集袋', '枝剪', '标本纸',
  '采集签', '便携秤', '罗盘', '测高仪', '雨量筒', '土钻', '卷尺', '放大镜',
  '标本箱', '防潮袋', '路线标记带',
]

const ASPECTS = [
  '便携性', '防潮', '记录格式', '耐寒', '称量精度', '编号方式',
  '封装', '野外固定', '携带方式', '标注规范', '数据表格式', '保存期限',
]

const STATION_TYPES = [
  '固定样地', '观测点', '种子圃', '气象观测哨', '标本暂存点',
  '苗圃', '围栏样地', '径流场', '物候观察点', '林线标记点',
]

const EXPEDITION_GOALS = [
  '植被普查', '样地复测', '种子采集', '物候记录', '林线复核', '标本补采',
  '火后迹地调查', '放牧影响评估', '溪流岸带调查', '雪线观测', '苔藓采集', '树种更新调查',
]

const CLASS_KINDS = ['野外讲习班', '暑期学校', '基层培训班', '专题研修班']

/* -------------------------------------------------- 条目构造与去重 */

const seen = new Set()
let collisions = 0
let seq = 0

/** 年份分布：1954（毕业后）–2020，密度随年龄上升 */
function pickYear() {
  const shaped = Math.pow(rnd(), 0.62)
  return Math.min(2020, Math.max(1949, Math.round(1954 + shaped * (2020 - 1954))))
}

const withMonth = () => (rnd() < 0.28 ? `-${String(int(3, 10)).padStart(2, '0')}` : '')

/**
 * 造一条记录。build() 返回 { title, context }；标题撞了就把 build() 整个重抽 ——
 * 这样一千条可以读起来各不相同，而不是靠「（续）」硬凑。
 * year 传了就用手写年份（里程碑必须落在正确的生命阶段），否则按分布抽。
 */
function emit(domain, journey, pivotal, year, build) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const { title, context } = build()
    if (seen.has(title)) continue
    seen.add(title)
    seq += 1
    return {
      id: `ach-demo-${String(seq).padStart(4, '0')}`,
      title,
      when: `${year ?? pickYear()}${withMonth()}`,
      domain,
      pivotal,
      context,
      source: '',
      journey,
      _seq: seq,
    }
  }
  collisions += 1
  const { title, context } = build()
  const t = `${title}（补遗）`
  seen.add(t)
  seq += 1
  return {
    id: `ach-demo-${String(seq).padStart(4, '0')}`,
    title: t,
    when: `${year ?? pickYear()}${withMonth()}`,
    domain,
    pivotal,
    context,
    source: '',
    journey,
    _seq: seq,
  }
}

/* ------------------------------------------------------------ 各领域 */

// 旅程要带确定性 id：种子的形状必须和 server/seed/lives.json 一致。
// 少了 id，客户端把这份种子直接当 LifeDoc 用时就会缺字段 ——
// 服务器播种时会补 id，但纯静态站（GitHub Pages）没有服务器。
const JOURNEYS = [
  { id: 'jr-demo-0', name: '求学与入门', domainHint: 'academy' },
  { id: 'jr-demo-1', name: '山地植被调查', domainHint: 'journey' },
  { id: 'jr-demo-2', name: '标本与图志', domainHint: 'craft' },
  { id: 'jr-demo-3', name: '讲台与学生', domainHint: 'academy' },
  { id: 'jr-demo-4', name: '著述', domainHint: 'creation' },
  { id: 'jr-demo-5', name: '合作与交流', domainHint: 'relation' },
  { id: 'jr-demo-6', name: '晚年整理', domainHint: 'creation' },
]

const creationEntries = (n) =>
  Array.from({ length: n }, (_, i) =>
    emit('creation', i % 3 === 0 ? '山地植被调查' : '著述', false, null, () => {
      const kind = rnd()
      const region = pick(REGIONS)
      if (kind < 0.6) {
        const subject = pick(SUBJECTS)
        const method = pick(METHODS)
        return {
          title: `发表《${region}${subject}的${method}》`,
          context: `（虚构记录）刊于${pick(JOURNALS)}。这一篇整理了他对${region}${subject}的长期观察。`,
        }
      }
      if (kind < 0.8) {
        return {
          title: `出版《${region}${pick(BOOK_KINDS)}》`,
          context: `（虚构记录）书稿由${pick(INSTITUTIONS)}资助完成，是他关于${region}最完整的一份整理。`,
        }
      }
      if (kind < 0.92) {
        return {
          title: `完成《${region}植被调查报告》第 ${int(2, 19)} 卷`,
          context: `（虚构记录）报告逐段记录了${region}各海拔带的群落组成。`,
        }
      }
      return {
        title: `为《${region}${pick(SUBJECTS)}》撰写综述`,
        context: `（虚构记录）受${pick(JOURNALS)}之邀撰写，总结了该方向数十年的进展。`,
      }
    }),
  )

const academyEntries = (n) =>
  Array.from({ length: n }, () =>
    emit('academy', '讲台与学生', false, null, () => {
      const kind = rnd()
      if (kind < 0.4) {
        return {
          title: `讲授《${pick(COURSES)}》第 ${int(2, 36)} 轮`,
          context: `（虚构记录）自 1955 年起在讲台上反复开这门课，前后带过${int(6, 40)}届学生。`,
        }
      }
      if (kind < 0.7) {
        const subject = pick(SUBJECTS)
        return {
          title: `指导第 ${int(2, 62)} 位研究生完成${subject}方向的学位论文`,
          context: '（虚构记录）他的学生后来分散在各地的植物园、保护区与高校。',
        }
      }
      if (kind < 0.88) {
        return {
          title: `主持${pick(REGIONS)}${pick(SUBJECTS)}${pick(CLASS_KINDS)}`,
          context: `（虚构记录）讲习以现场识别为主，累计参加者${int(20, 240)}人。`,
        }
      }
      return {
        title: `获${pick(INSTITUTIONS)}${pick(AWARDS)}`,
        context: '（虚构记录）奖励来自长期野外教学与资料积累。',
      }
    }),
  )

const craftEntries = (n) =>
  Array.from({ length: n }, () =>
    emit('craft', '标本与图志', false, null, () => {
      const kind = rnd()
      if (kind < 0.32) {
        return {
          title: `绘制${pick(REGIONS)}植被图第 ${int(2, 48)} 幅`,
          context: '（虚构记录）手工上色，一幅图往往要反复上山核对数次。',
        }
      }
      if (kind < 0.6) {
        return {
          title: `整理并鉴定第 ${int(500, 48000)} 号标本`,
          context: `（虚构记录）标本入藏${pick(INSTITUTIONS)}，附完整采集记录。`,
        }
      }
      if (kind < 0.78) {
        return {
          title: `建成${pick(REGIONS)}${pick(STATION_TYPES)}`,
          context: '（虚构记录）此后成为长期定位观测的基础。',
        }
      }
      const item = pick(ITEMS)
      return {
        title: `改进${item}的${pick(ASPECTS)}`,
        context: '（虚构记录）都是为了让长途考察更轻、更可靠。',
      }
    }),
  )

const journeyEntries = (n) =>
  Array.from({ length: n }, () =>
    emit('journey', '山地植被调查', false, null, () => {
      const season = pick(SEASONS)
      return {
        title: `第 ${int(2, 68)} 次进入${pick(REGIONS)}考察（${season}·${pick(EXPEDITION_GOALS)}）`,
        context: `（虚构记录）${season}出发，历时${int(4, 96)}天，行程以步行为主。`,
      }
    }),
  )

const HONORARY_POSTS = ['名誉所长', '顾问', '客座研究员', '评审专家', '特聘教授', '野外指导']

const careerEntries = (n) =>
  Array.from({ length: n }, (_, i) => {
    // 先定年份再选职务：2006 年退休之后只可能是荣誉性的头衔，
    // 否则会出现「退休十四年后又被任命为研究室主任」这种矛盾。
    const year = pickYear()
    const post = year > 2006 ? pick(HONORARY_POSTS) : pick(POSTS.filter((p) => !HONORARY_POSTS.includes(p)))
    return emit('career', i % 2 === 0 ? '合作与交流' : '标本与图志', false, year, () => ({
      title: `任${pick(INSTITUTIONS)}${post}`,
      context: '（虚构记录）职务多为兼职，他的重心始终在野外与书稿上。',
    }))
  })

const relationEntries = (n) =>
  Array.from({ length: n }, () =>
    emit('relation', '合作与交流', false, null, () => ({
      title: `与${pick(PARTNERS)}建立${pick(['长期', '联合', '资料交换', '互访', '共同出版'])}合作`,
      context: '（虚构记录）合作多围绕标本互借、样地共建与联合考察展开。',
    })),
  )

const passionEntries = (n) =>
  Array.from({ length: n }, () =>
    emit('passion', '晚年整理', false, null, () => ({
      title: `举办山野摄影展第 ${int(2, 14)} 回`,
      context: '（虚构记录）照片全部摄于考察途中，主题是林线与花期。',
    })),
  )

/* ---------------------------------------------------------- 里程碑 */

/** 年份手写：必须落在正确的生命阶段上 */
function milestones() {
  return [
    emit('academy', '求学与入门', true, 1949, () => ({
      title: '考取大学植物学专业',
      context: '（虚构记录）这是他一生野外工作的起点。',
    })),
    emit('academy', '求学与入门', true, 1953, () => ({
      title: '以《山地植被垂直分布》通过毕业论文',
      context: '（虚构记录）论文的观察材料来自三次暑期考察。',
    })),
    emit('creation', '求学与入门', true, 1954, () => ({
      title: '发表第一篇学术论文',
      context: '（虚构记录）关于林线附近群落的初步观察。',
    })),
    emit('career', '标本与图志', true, 1955, () => ({
      title: '入职西南山地生物研究所',
      context: '（虚构记录）从此把一生交给了这片山区。',
    })),
    emit('creation', '著述', true, 1962, () => ({
      title: '出版第一部专著',
      context: '（虚构记录）写的是他走了最多遍的那一条河谷。',
    })),
    emit('craft', '山地植被调查', true, 1966, () => ({
      title: '主持建成第一个高山观测站',
      context: '（虚构记录）站址在海拔与交通之间取了折中。',
    })),
    emit('academy', '讲台与学生', true, 1972, () => ({
      title: '晋升研究员',
      context: '（虚构记录）同年他开始主持植被研究室。',
    })),
    emit('craft', '标本与图志', true, 1976, () => ({
      title: '完成第一幅全省植被图',
      context: '（虚构记录）历时数年，几易其稿。',
    })),
    emit('creation', '著述', true, 1981, () => ({
      title: '出版《中国山地植被志》第一卷',
      context: '（虚构记录）此后陆续出齐。',
    })),
    emit('career', '合作与交流', true, 1984, () => ({
      title: '任植被研究室主任',
      context: '（虚构记录）任内推动了多项长期样地建设。',
    })),
    emit('journey', '山地植被调查', true, 1988, () => ({
      title: '完成横断山全境徒步考察',
      context: '（虚构记录）分段进行，累计行程以千里计。',
    })),
    emit('academy', '讲台与学生', true, 1992, () => ({
      title: '获全国野外科学工作奖',
      context: '（虚构记录）奖励他数十年不间断的野外记录。',
    })),
    emit('relation', '合作与交流', true, 1996, () => ({
      title: '发起山地植被长期观测协作网',
      context: '（虚构记录）联合多家单位共建共享样地数据。',
    })),
    emit('creation', '晚年整理', true, 2003, () => ({
      title: '出版《林线笔记》',
      context: '（虚构记录）晚年写成，读起来更像一部关于海拔的随笔。',
    })),
    emit('career', '晚年整理', true, 2006, () => ({
      title: '退休并受聘为名誉所长',
      context: '（虚构记录）退休后仍每年上山。',
    })),
    emit('creation', '晚年整理', true, 2012, () => ({
      title: '整理一生调查资料并移交档案',
      context: '（虚构记录）数十年手稿、图幅与照片全部归档。',
    })),
    emit('craft', '晚年整理', true, 2016, () => ({
      title: '完成最后一份标本入藏',
      context: '（虚构记录）编号紧接他五十年前的第一份。',
    })),
    emit('creation', '晚年整理', true, 2019, () => ({
      title: '出版《一千次上山》',
      context: '（虚构记录）他说这本书写的不是山，是时间。',
    })),
  ]
}

/* ------------------------------------------------------------ 组装 */

const ms = milestones()
const countOf = (d) => ms.filter((m) => m.domain === d).length
const budget = {
  creation: 400,
  academy: 180,
  craft: 160,
  journey: 140,
  career: 80,
  relation: 30,
  passion: 10,
}

const entries = [
  ...ms,
  ...creationEntries(budget.creation - countOf('creation')),
  ...academyEntries(budget.academy - countOf('academy')),
  ...craftEntries(budget.craft - countOf('craft')),
  ...journeyEntries(budget.journey - countOf('journey')),
  ...careerEntries(budget.career - countOf('career')),
  ...relationEntries(budget.relation - countOf('relation')),
  ...passionEntries(budget.passion - countOf('passion')),
]

// 精确对齐到 1000
while (entries.length > TOTAL) {
  const i = entries.findIndex((e) => e.domain === 'creation' && !e.pivotal)
  if (i < 0) break
  entries.splice(i, 1)
}
while (entries.length < TOTAL) {
  entries.push(
    ...creationEntries(TOTAL - entries.length).map((e) => e),
  )
}

entries.sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : a._seq - b._seq))
const achievements = entries.map((e, i) => ({
  id: `ach-demo-${String(i + 1).padStart(4, '0')}`,
  title: e.title,
  when: e.when,
  domain: e.domain,
  pivotal: e.pivotal,
  context: e.context,
  source: '',
  journey: e.journey,
}))

const life = {
  id: 'demo-thousand',
  // 与这个应用同名。id 保持 demo-thousand 不变 —— 改 id 会让已经分享出去的
  // /life/demo-thousand 直接失效。
  name: '星履',
  tagline: '虚构人物 · 与这个应用同名 · 一生留下一千条记录',
  fictional: true,
  summary:
    '他不是真人。造出他来只有一个目的：让你看看一千条成就在一片星空中长成什么样子。他的一生被设定为 1930 到 2020：读了植物学，此后七十年反复进出同一片山区，写论文、出书、画图、做标本、带学生、建观测站，直到晚年把一生的手稿归档。',
  birthYear: 1930,
  deathYear: 2020,
  provenance:
    '⚠️ 这是虚构人物，不是史料。由 scripts/build-demo-life.mjs 用固定随机种子程序化生成，共 1000 条，可复现、可逐条审查。请勿引用，也不要把它与任何真人对应。收录范围仍然只含成就（论文／著作／课程／学生／地图／标本／考察／职务／合作／展览），生卒与私人事件不进条目。',
  importanceRule:
    '开篇、第一部专著、第一个观测站、第一幅植被图、全境考察、受奖、退休与最后一次归档等里程碑记为 4；其余公开成就记为 3。共鸣度不评分。',
  published: true,
  updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
  journeys: JOURNEYS,
  achievements,
}

const outPath = join(ROOT, 'server/seed/demo.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify({ version: 1, updatedAt: new Date().toISOString(), lives: [life] }, null, 2))

const byDomain = {}
for (const a of achievements) byDomain[a.domain] = (byDomain[a.domain] ?? 0) + 1
const years = achievements.map((a) => Number(a.when.slice(0, 4)))
const decades = {}
for (const y of years) {
  const d = Math.floor((y - 1949) / 10) * 10 + 1949
  decades[d] = (decades[d] ?? 0) + 1
}
const suffixed = achievements.filter((a) => /（补遗）/.test(a.title)).length

console.log(`已写入 ${outPath}`)
console.log(`  ${life.name}（虚构）  ${life.birthYear}–${life.deathYear}  ${achievements.length} 条  ${life.journeys.length} 段旅程`)
console.log(`  年份跨度：${Math.min(...years)}–${Math.max(...years)}`)
console.log(`  领域分布：${Object.entries(byDomain).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
console.log(`  年代分布：${Object.entries(decades).map(([k, v]) => `${k}s ${v}`).join(' · ')}`)
console.log(`  里程碑（pivotal）：${achievements.filter((a) => a.pivotal).length} 条`)
console.log(`  不同标题：${new Set(achievements.map((a) => a.title)).size} / ${achievements.length}`)
console.log(`  重抽 40 次仍撞名的条目：${collisions}（>0 说明词库该加宽）+ 兜底后缀 ${suffixed}`)
