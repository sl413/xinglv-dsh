// 星履 · 群星列传种子构建
// ---------------------------------------------------------------------------
// 用法：node scripts/build-seed.mjs
// 产出：server/seed/lives.json （服务器第一次启动时用它播种名人库）
//
// 名人库的长期维护入口是应用里的管理端（登录后新增/编辑/保存）。
// 这个脚本只负责给出**初始的那一批**；苏轼那份已经写在
// scripts/seed-source/suShi.mjs 里，这里原样转过来，避免同一份内容维护两遍。
//
// ★ 收录范围（四位人物一律照此执行）
//   只要成就：作品／著作／论文／官职／功名／工程／荣誉／讲学／育人。
//   不要生卒、疾病、婚丧、迁居、单纯的出发与抵达、别人的作为 ——
//   那些是传记事件，不是成就；人物的生卒年份记在 birthYear / deathYear 里。
//   这道规则由 scripts/check-library.mjs 自动检查，不靠人记得。
//
// 其他底线：不写第一人称内心话（context 一律第三人称史实背景）；
// 只用年份级、流传较广的公开节点；重要程度按公开规则；共鸣度不评分；
// source 一律留空 —— 这是离线整理的，没有逐条核对到可引用的出处，
// 该字段留给管理端逐条补全，而不是在这里编一个看起来很像的引文。

import chenLing from './seed-source/chenLing.mjs'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))

/** 苏轼那份数据直接 import —— 它就是普通的 ESM，不需要再做任何转换 */
async function readSuShi() {
  const mod = await import(`file://${join(ROOT, 'scripts/seed-source/suShi.mjs').replace(/\\/g, '/')}`)
  return mod.default
}

function suShiToDoc(life) {
  return {
    id: 'su-shi',
    name: life.name,
    tagline: life.tagline,
    summary: life.summary,
    birthYear: 1037,
    deathYear: 1101,
    provenance: life.provenance,
    importanceRule: life.importanceRule,
    published: true,
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    journeys: life.journeys.map((j, i) => ({ id: `jr-su-shi-${i}`, name: j.name, domainHint: j.domainHint })),
    achievements: life.seeds.map((s, i) => ({
      id: `ach-su-shi-${String(i).padStart(3, '0')}`,
      title: s.title,
      when: s.month ? `${s.year}-${String(s.month).padStart(2, '0')}` : `${s.year}`,
      domain: s.domain,
      pivotal: !!s.pivotal,
      context: s.context,
      source: '',
      journey: s.journey,
    })),
  }
}

/* --------------------------------------------------------- 紧凑录入格式 */

// [年份, 月份|0, 标题, 领域, 是否决定性节点, 旅程名|'', 史实背景]
const A = (year, month, title, domain, pivotal, journey, context) => ({ year, month, title, domain, pivotal, journey, context })

const SCOPE =
  '收录范围：只收录可称为成就的公开节点 —— 作品、著作、论文、官职、功名、工程、荣誉、讲学、育人。生卒、疾病、婚丧、迁居与单纯的行程不收录（生卒年份见人物资料）。'
const DISCLAIM =
  '本条目为离线整理，只使用年份级、流传较广的公开节点，未逐条核对，不作为史料引用。资料来源字段一律留空 —— 它留给管理端逐条补全，而不是在这里编造一个看起来很像的引文。'

const EINSTEIN = {
  id: 'einstein',
  name: '爱因斯坦',
  tagline: '物理学家，相对论创立者',
  summary:
    '在专利局当小职员的那几年里写下四篇论文，此后一生都在追问时间与空间到底是什么：狭义相对论、广义相对论、宇宙学方程、量子统计。后半生在普林斯顿度过。',
  birthYear: 1879,
  deathYear: 1955,
  provenance: `${SCOPE}${DISCLAIM}`,
  importanceRule:
    '奇迹年的四篇论文、广义相对论场方程、诺贝尔奖记为 4；其余公开成就（学位、教职、论文）记为 3。共鸣度不评分。',
  journeys: [
    { name: '专利局里的奇迹年', domainHint: 'creation' },
    { name: '从伯尔尼到柏林', domainHint: 'academy' },
    { name: '广义相对论', domainHint: 'creation' },
    { name: '量子与统计', domainHint: 'creation' },
    { name: '普林斯顿', domainHint: 'career' },
  ],
  rows: [
    A(1900, 0, '自苏黎世联邦理工学院毕业', 'academy', false, '从伯尔尼到柏林', '（史实背景）他毕业于苏黎世联邦理工学院师范系，取得教师资格，但未能获得学校教职。'),
    A(1905, 0, '获苏黎世大学博士学位', 'academy', false, '专利局里的奇迹年', '（史实背景）他在专利局任职期间提交并完成了博士论文。'),
    A(1905, 0, '发表光量子假说，解释光电效应', 'creation', true, '专利局里的奇迹年', '（史实背景）这一年四篇论文中的第一篇，提出光的能量以量子形式存在。他后来正是因这项工作获得诺贝尔物理学奖。'),
    A(1905, 0, '发表布朗运动论文', 'creation', false, '专利局里的奇迹年', '（史实背景）他以分子运动论解释悬浮微粒的不规则运动，为原子真实存在提供了可检验的论据。'),
    A(1905, 0, '发表狭义相对论', 'creation', true, '专利局里的奇迹年', '（史实背景）《论动体的电动力学》重建了时间与空间的关系，是二十世纪物理学的基石之一。'),
    A(1905, 0, '提出质能关系', 'creation', true, '专利局里的奇迹年', '（史实背景）作为狭义相对论的补充论文，给出质量与能量的等价关系。'),
    A(1907, 0, '发表固体比热的量子理论', 'creation', false, '量子与统计', '（史实背景）他把普朗克的量子假设用于固体中原子的振动，解释了低温下比热下降的现象。这是早期量子论的三篇奠基性论文之一。'),
    A(1907, 0, '提出等效原理', 'creation', true, '广义相对论', '（史实背景）他论证引力与加速度在局部不可区分，并指出引力会使光线弯曲。这是通往广义相对论的关键一步。'),
    A(1908, 0, '任伯尔尼大学编外讲师', 'academy', false, '从伯尔尼到柏林', '（史实背景）他离开专利局，开始正式的学术生涯。'),
    A(1909, 0, '任苏黎世大学副教授', 'academy', false, '从伯尔尼到柏林', '（史实背景）他获得第一个正式教职。'),
    A(1911, 0, '预言日食时星光会被太阳偏折', 'creation', false, '广义相对论', '（史实背景）他从等效原理推出光线经过太阳附近会偏折并给出可检验的预言（当时的数值还不准确，1915 年被自己修正）。'),
    A(1911, 0, '任布拉格德语大学正教授', 'academy', false, '从伯尔尼到柏林', '（史实背景）他赴布拉格任理论物理学正教授，在任约一年半。'),
    A(1912, 0, '回苏黎世联邦理工任教授', 'academy', false, '从伯尔尼到柏林', '（史实背景）他回到母校任教，与格罗斯曼合作研究引力理论。'),
    A(1914, 0, '任柏林大学教授并当选普鲁士科学院院士', 'career', true, '从伯尔尼到柏林', '（史实背景）他迁往柏林，任大学教授并当选普鲁士科学院院士，此后在此工作近二十年。'),
    A(1915, 11, '完成广义相对论场方程', 'creation', true, '广义相对论', '（史实背景）经过数年摸索，他向普鲁士科学院提交了广义相对论的完整场方程，并用以解释水星近日点的进动。这是他对物理学最重要的贡献。'),
    A(1916, 0, '出版《广义相对论的基础》', 'creation', false, '广义相对论', '（史实背景）他把广义相对论系统整理成书，成为此后几十年被引用的经典表述。'),
    A(1916, 0, '任德国物理学会主席', 'career', false, '从伯尔尼到柏林', '（史实背景）他在战时被推举为德国物理学会主席，任内主张学术的国际性。'),
    A(1916, 0, '发表辐射的量子理论，导出受激发射', 'creation', false, '量子与统计', '（史实背景）他重新推导普朗克辐射定律，导出光量子携带的动量，并给出受激发射的概念 —— 这是后来激光的理论基础。'),
    A(1917, 0, '任威廉皇帝物理研究所所长', 'career', false, '从伯尔尼到柏林', '（史实背景）他出任新成立的威廉皇帝物理研究所所长，这一职位使他能在战时继续研究。'),
    A(1917, 0, '发表广义相对论的宇宙学考察', 'creation', false, '广义相对论', '（史实背景）他尝试用场方程描述整个宇宙，引入「宇宙项」，开启了现代宇宙学。'),
    A(1919, 0, '广义相对论获日食观测证实', 'creation', true, '广义相对论', '（史实背景）英国两支远征队观测到日食期间星光经过太阳附近发生偏折，与广义相对论的预言一致，他因此一夜之间成为世界名人。'),
    A(1922, 0, '获诺贝尔物理学奖', 'academy', true, '从伯尔尼到柏林', '（史实背景）他获得 1921 年度的诺贝尔物理学奖，授奖理由是光电效应定律。同年他还在研究统一场论。'),
    A(1924, 0, '爱因斯坦研究所与「爱因斯坦塔」在波茨坦落成', 'craft', false, '从伯尔尼到柏林', '（史实背景）以他命名的天体物理研究所落成，附属的太阳塔用于验证相对论效应。'),
    A(1924, 0, '发表单原子理想气体的量子理论', 'creation', false, '量子与统计', '（史实背景）他在玻色来信的基础上给出玻色—爱因斯坦统计，并预言了后来被称为玻色—爱因斯坦凝聚的现象。'),
    A(1929, 0, '发表《统一场论》', 'creation', false, '广义相对论', '（史实背景）他公布把引力场与电磁场统一起来的尝试，引起媒体极大关注。此后二十余年他持续在做这件事，但未获成功。'),
    A(1932, 0, '受聘为普林斯顿高等研究院教授', 'career', true, '普林斯顿', '（史实背景）他受聘于新成立的普林斯顿高等研究院，原计划在柏林与普林斯顿之间分配时间，次年起定居美国。'),
    A(1935, 0, '与波多尔斯基、罗森发表 EPR 论文', 'creation', false, '量子与统计', '（史实背景）这篇论文提出了后来被称为量子纠缠的问题，成为量子力学基础讨论的起点。'),
    A(1946, 0, '任原子科学家紧急委员会主席', 'career', false, '普林斯顿', '（史实背景）战后他出任该委员会主席，推动核武器的国际管制与公众教育。'),
    A(1948, 0, '发表《广义引力论》', 'creation', false, '广义相对论', '（史实背景）他继续尝试寻找更普遍的表达方式来处理引力场，这是他晚年一系列统一场论工作的一例。'),
    A(1952, 0, '获邀出任以色列总统并婉拒', 'career', false, '普林斯顿', '（史实背景）以色列政府邀请他接任总统，他以自己缺乏处理人事与政务的能力为由谢绝。这算是他被授予过的最特殊的荣誉。'),
  ],
}

const CURIE = {
  id: 'curie',
  name: '居里夫人',
  tagline: '物理学家、化学家，放射性研究奠基者',
  summary:
    '从华沙到巴黎，靠家教攒钱读完大学；与丈夫在简陋的棚屋里从成吨沥青铀矿中提炼出镭。丈夫去世后她接任他的教职，成为索邦第一位女教授，也是唯一在两个不同学科里拿到诺贝尔奖的人。',
  birthYear: 1867,
  deathYear: 1934,
  provenance: `${SCOPE}${DISCLAIM}`,
  importanceRule:
    '发现钋与镭、两次诺贝尔奖、接任索邦教职、提炼出纯镭、战地 X 光车记为 4；其余公开成就（学位、任职、著作）记为 3。共鸣度不评分。',
  journeys: [
    { name: '从华沙到巴黎', domainHint: 'academy' },
    { name: '棚屋里的镭', domainHint: 'craft' },
    { name: '失去皮埃尔之后', domainHint: 'career' },
    { name: '战地 X 光车', domainHint: 'health' },
  ],
  rows: [
    A(1893, 0, '以第一名取得物理学学士学位', 'academy', false, '从华沙到巴黎', '（史实背景）她在索邦以第一名的成绩取得物理学学士学位，此前靠家教积蓄与姐姐接济维持学业。'),
    A(1894, 0, '取得数学学士学位', 'academy', false, '从华沙到巴黎', '（史实背景）她取得第二个学士学位，同年为研究钢铁磁性而结识皮埃尔·居里。'),
    A(1897, 0, '提出铀射线是原子的性质并系统研究', 'creation', false, '棚屋里的镭', '（史实背景）她开始研究贝克勒尔发现的铀盐射线，并意识到这可能是一种普遍存在的原子现象，由此开创了放射性研究。'),
    A(1898, 0, '提出「放射性」一词', 'creation', false, '棚屋里的镭', '（史实背景）她用「放射性」来统称这类无需外界作用、自发辐射的现象，这个词此后成为整个领域的名称。'),
    A(1898, 0, '发现钋', 'creation', true, '棚屋里的镭', '（史实背景）她与皮埃尔、贝蒙一起从沥青铀矿中分离出新元素，以她的祖国波兰命名为钋。'),
    A(1898, 0, '发现镭', 'creation', true, '棚屋里的镭', '（史实背景）同年他们又发现了镭，命名取自「光线」。'),
    A(1900, 0, '任塞夫勒女子师范学校教师', 'career', false, '从华沙到巴黎', '（史实背景）她开始在该校任教，这是她第一份有固定收入的教职。'),
    A(1902, 0, '提炼出氯化镭并测定镭的原子量', 'craft', true, '棚屋里的镭', '（史实背景）在与丈夫共同使用的简陋棚屋里，她从数吨沥青铀矿残渣中提炼出约十分之一克氯化镭，并测定了镭的原子量。'),
    A(1903, 0, '完成博士论文《放射性物质的研究》', 'academy', false, '棚屋里的镭', '（史实背景）她以此通过博士论文答辩，是法国第一位取得物理学博士学位的女性；论文随后出版成书。'),
    A(1903, 0, '与皮埃尔、贝克勒尔共获诺贝尔物理学奖', 'academy', true, '棚屋里的镭', '（史实背景）她成为第一位获得诺贝尔奖的女性。'),
    A(1906, 4, '接任皮埃尔在索邦的教职', 'career', true, '失去皮埃尔之后', '（史实背景）皮埃尔因马车事故去世后，她接任丈夫在索邦的教职，成为该校历史上第一位女教授。'),
    A(1910, 0, '出版《放射性专论》并制出镭的标准样品', 'creation', false, '失去皮埃尔之后', '（史实背景）她把自己多年的研究成果写成专著，并制备了国际通用的镭标准样品。'),
    A(1911, 0, '获诺贝尔化学奖', 'academy', true, '失去皮埃尔之后', '（史实背景）她因分离出纯镭并测定其性质获得诺贝尔化学奖，成为唯一在两个不同学科获得诺贝尔奖的科学家。'),
    A(1914, 0, '主持建成巴黎镭研究所', 'craft', false, '失去皮埃尔之后', '（史实背景）由她主持的镭研究所建成，此后成为放射性研究的中心之一。'),
    A(1914, 8, '组织战地流动 X 光车并培训操作人员', 'craft', true, '战地 X 光车', '（史实背景）战争期间她组织了一批装有 X 光设备的流动车，并亲自到前线培训操作人员，据估算有上百万伤员因此接受过检查。'),
    A(1921, 0, '访美并接受一克镭的赠予', 'relation', false, '失去皮埃尔之后', '（史实背景）美国妇女界为她募集资金购买了一克镭赠予她，由哈定总统在白宫转交。'),
    A(1929, 0, '为华沙放射学研究所募得第二克镭', 'relation', false, '失去皮埃尔之后', '（史实背景）她再次访问美国，为在家乡华沙建立的放射学研究所募集到第二克镭。'),
    A(1932, 0, '出席以她命名的华沙镭研究所落成', 'craft', false, '从华沙到巴黎', '（史实背景）她回到少年时代离开的城市，参加镭研究所落成典礼。'),
  ],
}

const VAN_GOGH = {
  id: 'van-gogh',
  name: '梵高',
  tagline: '荷兰画家，后印象派代表人物',
  summary:
    '二十七岁才决定当画家，十年里几乎把命都画了进去。人生最后两年多在法国南部度过，画出《向日葵》《星月夜》这一批作品。他的成就几乎全部落在画作本身 —— 生前几乎没有卖出过画。',
  birthYear: 1853,
  deathYear: 1890,
  provenance: `${SCOPE}${DISCLAIM}他的成就几乎全部是画作，所以这一片星空集中在「创作」一个领域 —— 这不是数据缺失，是事实如此。`,
  importanceRule: '《吃土豆的人》《向日葵》《星月夜》《麦田群鸦》等代表作记为 4；其余年份明确的作品记为 3。共鸣度不评分。',
  journeys: [
    { name: '荷兰时期', domainHint: 'creation' },
    { name: '巴黎时期', domainHint: 'creation' },
    { name: '阿尔勒：黄色房子', domainHint: 'creation' },
    { name: '圣雷米与奥维尔', domainHint: 'creation' },
  ],
  rows: [
    A(1885, 0, '作《吃土豆的人》', 'creation', true, '荷兰时期', '（史实背景）他在纽南期间完成的代表作，试图表现农民真实的生活面貌，是他自认的早期总结之作。'),
    A(1887, 0, '作《唐吉老爹》', 'creation', false, '巴黎时期', '（史实背景）为画材商唐吉老爹所作肖像。在巴黎的两年里他的用色明显变亮，并吸收了印象派与新印象派的手法。'),
    A(1888, 4, '作《盛开的桃花》等果园系列', 'creation', false, '阿尔勒：黄色房子', '（史实背景）到阿尔勒后他先画了一批开花的果园与桃树，用明亮的粉色与蓝色记录南法的春天。这批作品是他用色转变的见证。'),
    A(1888, 8, '作《向日葵》系列', 'creation', true, '阿尔勒：黄色房子', '（史实背景）他为迎接高更的到来，画了一组以向日葵为主题的画作，用以装饰阿尔勒住处的客房。'),
    A(1888, 9, '作《黄房子》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）他画下自己租住的阿尔勒住处，希望把它变成画家互助的「南方画室」。'),
    A(1888, 9, '作《夜间咖啡馆》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）以强烈的黄与蓝画下阿尔勒的夜间室内，是他色彩实验的代表作之一。'),
    A(1888, 9, '作《夜间的露天咖啡座》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）画的是夜晚，画面里却没有一处黑：星空是浓蓝，灯棚与平台是暖黄与橙，夜与昼的用色几乎被调换过来。'),
    A(1888, 9, '作《罗纳河上的星夜》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）在阿尔勒罗纳河畔所作夜景，先于《星月夜》。'),
    A(1888, 10, '作《阿尔勒的卧室》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）他画出自己的卧室，用色块而非透视来组织空间，并留下三个几乎相同的版本。'),
    A(1888, 10, '为邮差鲁林一家作肖像系列', 'creation', false, '阿尔勒：黄色房子', '（史实背景）在阿尔勒愿意为他做模特的人很少，邮差约瑟夫·鲁林及其家人是其中最重要的几位，他为他们画了一系列肖像。'),
    A(1889, 1, '作《耳朵包着绷带的烟斗自画像》', 'creation', false, '阿尔勒：黄色房子', '（史实背景）割耳事件之后所作的自画像之一，头上缠着绷带、嘴里叼着烟斗，是他自画像中最广为人知的一幅。'),
    A(1889, 5, '作《鸢尾花》', 'creation', false, '圣雷米与奥维尔', '（史实背景）入院初期所作，以鸢尾花为主题，是他生前较早就被展出的作品之一。'),
    A(1889, 6, '在圣雷米作《星月夜》', 'creation', true, '圣雷米与奥维尔', '（史实背景）他在圣雷米的精神病院中凭记忆画出此画，成为他流传最广的作品。'),
    A(1889, 9, '作《麦田与柏树》', 'creation', false, '圣雷米与奥维尔', '（史实背景）在圣雷米期间反复描绘柏树与麦田，形成一组系列作品。'),
    A(1890, 0, '作《杏花》', 'creation', false, '圣雷米与奥维尔', '（史实背景）为弟弟提奥新生的儿子所作，是他送给家人的礼物。'),
    A(1890, 6, '作《加歇医生像》', 'creation', false, '圣雷米与奥维尔', '（史实背景）在奥维尔为照料他的加歇医生所作肖像。此画后来长期保持着艺术品拍卖的最高价纪录。'),
    A(1890, 7, '作《麦田群鸦》', 'creation', true, '圣雷米与奥维尔', '（史实背景）他人生最后一批作品之一，以横向的三联构图与飞起的鸦群为人熟知。'),
  ],
}

/* ------------------------------------------------------------ 组装输出 */

// ★ 陈伶是**虚构人物**（网络小说《我不是戏神》主角）。他与真人库共用同一套结构与 lint，
//   靠 fictional 标记、tagline 与 provenance 标明身份 —— 绝不写成史实背景。
const FIGURES = [EINSTEIN, CURIE, VAN_GOGH, chenLing]

function docFromFigure(f) {
  const journeyIds = new Map(f.journeys.map((j, i) => [j.name, `jr-${f.id}-${i}`]))
  return {
    id: f.id,
    name: f.name,
    tagline: f.tagline,
    summary: f.summary,
    birthYear: f.birthYear,
    deathYear: f.deathYear,
    provenance: f.provenance,
    importanceRule: f.importanceRule,
    // ★ 虚构标记必须带出来：漏了这一行，人物在列表与星空上就不会显示「虚构」，
    //   而群星列传的整个立场就靠这个标记撑着（实测漏过一次，chen-ling 出来是 fictional=false）。
    fictional: f.fictional === true,
    published: true,
    updatedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    journeys: f.journeys.map((j, i) => ({ id: `jr-${f.id}-${i}`, name: j.name, domainHint: j.domainHint })),
    achievements: f.rows
      .map((r, i) => ({
        id: `ach-${f.id}-${String(i).padStart(3, '0')}`,
        title: r.title,
        when: r.month ? `${r.year}-${String(r.month).padStart(2, '0')}` : `${r.year}`,
        domain: r.domain,
        pivotal: !!r.pivotal,
        context: r.context,
        source: '',
        journey: r.journey && journeyIds.has(r.journey) ? r.journey : undefined,
      }))
      .sort((a, b) => (a.when < b.when ? -1 : a.when > b.when ? 1 : 0)),
  }
}

const suShi = suShiToDoc(await readSuShi())
const lives = [suShi, ...FIGURES.map(docFromFigure)]

const out = { version: 1, updatedAt: new Date().toISOString(), lives }
const outPath = join(ROOT, 'server/seed/lives.json')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, JSON.stringify(out, null, 2))

console.log(`已写入 ${outPath}`)
for (const l of lives) {
  const byDomain = {}
  for (const a of l.achievements) byDomain[a.domain] = (byDomain[a.domain] ?? 0) + 1
  const dist = Object.entries(byDomain)
    .map(([k, v]) => `${k} ${v}`)
    .join(' · ')
  console.log(`  ${l.name.padEnd(6)} ${l.birthYear}–${l.deathYear}  ${String(l.achievements.length).padStart(3)} 条  ${l.journeys.length} 段旅程`)
  console.log(`         ${dist}`)
}
console.log(`共 ${lives.length} 位，${lives.reduce((n, l) => n + l.achievements.length, 0)} 条成就`)
