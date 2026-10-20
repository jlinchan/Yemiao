/**
 * 夜喵首页的内容与素材映射（单一数据源）
 *
 * - 素材路径集中在这里，页面不要各写一份。
 * - 咨询师、书中技能、快捷入口的文案来自 Figma 设计稿「首页 · 夜喵」。
 * - 这里的练习步骤、咨询师开场白都是本地内容，不依赖任何后端或 AI 接口。
 */

const bookDirectory = require('./book-directory');

const assets = {
  hero: '/assets/home/night-bg.jpg',
  crescent: '/assets/home/icons/logo-crescent.png',
  flourish: '/assets/home/icons/flourish.png',
  sparkle: '/assets/home/icons/sparkle.png',
  settings: '/assets/home/icons/settings.png',
  counselorIcon: '/assets/home/icons/icon-counselor.png',
  bookIcon: '/assets/home/icons/icon-book.png',
  tryIcon: '/assets/home/icons/icon-try.png',
  chevron: '/assets/home/icons/icon-chevron.png',
  chipArrow: '/assets/home/icons/icon-chip-arrow.png',
  ctaArrow: '/assets/home/icons/icon-cta-arrow.png',
  composerIcon: '/assets/home/icons/icon-composer.png',
  sendIcon: '/assets/home/icons/icon-send.png'
};

/**
 * 咨询师卡片（全部 5 位，与 counselor-directory 同一目录）。
 * 头像：前三位用 home 竖版插画；sleep/growth 直接复用全部咨询师页的头像。
 * 2026-10-18 修复：补齐 sleep/growth 两位与各卡请求语（desc），并新增
 * featuredCounselors 精选字段——首页「陪伴者」区块此前读取该字段拿到 undefined，
 * 整块渲染为空白（见 tests/counselors.test.js 的数据契约）。
 */
const counselors = [
  {
    id: 'empathy',
    name: '共情陪伴师',
    desc: '心里委屈想倾诉',
    tags: ['情绪', '安全感'],
    homeTags: ['情绪', '安全感'],
    avatar: '/assets/counselors/empathy.jpg',
    prompt: '我在的，慢慢说就好。今天最让你难受的是什么？'
  },
  {
    id: 'cognitive',
    name: '认知重建师',
    desc: '越想越焦虑',
    tags: ['焦虑', '压力'],
    homeTags: ['焦虑', '压力'],
    avatar: '/assets/counselors/cognitive.jpg',
    prompt: '我们来拆一拆脑子里绕不过去的那件事，先从最让你紧绷的一句想法开始。'
  },
  {
    id: 'relation',
    name: '关系教练',
    desc: '关系累，难开口',
    tags: ['关系', '沟通'],
    homeTags: ['关系', '沟通'],
    avatar: '/assets/counselors/relation.jpg',
    prompt: '最近有哪段关系让你觉得累？我们先看看边界卡在哪里。'
  },
  {
    id: 'sleep',
    name: '睡眠陪伴师',
    desc: '想太多，睡不着',
    tags: ['睡前放松', '焦虑缓解', '睡眠引导'],
    homeTags: ['睡眠引导'],
    avatar: '/assets/counselors/sleep.jpg',
    prompt: '今晚先不用急着入睡。我们慢慢呼吸，把心里还放不下的事说一说，好吗？'
  },
  {
    id: 'yalom',
    name: '欧文·亚隆',
    desc: '心理大师同行疗愈',
    tags: ['跨时空对话', '深度共情'],
    homeTags: ['跨时空对话'],
    avatar: '/assets/counselors/yalom.jpg',
    prompt: '慢慢来。此刻最让你放不下的，是什么？'
  },
  {
    id: 'growth',
    name: '成长引导师',
    desc: '迷茫找不到方向',
    tags: ['自我探索', '成长规划', '人生方向'],
    homeTags: ['自我探索', '成长规划'],
    avatar: '/assets/counselors/growth.jpg',
    prompt: '我们可以从你最在意的一件小事开始。最近，你希望自己在哪个方向有一点改变？'
  }
];

/**
 * 首页「陪伴者」精选三位：睡眠陪伴师打头，其后欧文·亚隆与共情陪伴师。
 * 「查看全部」进 pages/counselors 看完整列表。
 */
const featuredCounselors = [
  counselors.find((item) => item.id === 'sleep'),
  counselors.find((item) => item.id === 'yalom'),
  counselors.find((item) => item.id === 'empathy')
];

/**
 * 书中技能。封面来自用户提供的 山水.png / 书.png / 森林.png。
 * steps 是本地练习脚本，用于「开始练习」详情页。
 */
const books = bookDirectory.featuredBooks;

/**
 * 「你可能想试试」快捷入口。每个入口对应 pages/topic 的一个本地引导脚本。
 */
const suggestions = [
  { id: 'exam', label: '考试焦虑', icon: '/assets/home/icons/icon-exam.png' },
  { id: 'thoughts', label: '睡前胡思乱想', icon: '/assets/home/icons/icon-thoughts.png' },
  { id: 'dorm', label: '宿舍难放松', icon: '/assets/home/icons/icon-dorm.png' }
];

/**
 * 快捷入口的本地引导内容。
 */
const topics = {
  exam: {
    id: 'exam',
    label: '考试焦虑',
    title: '考试焦虑',
    intro: '焦虑大多来自「还没发生」的那部分。先把身体放下来，再决定今晚做多少。',
    steps: [
      { title: '把担心写下来', detail: '写下三件最担心的事，写完就停在纸上，不继续推演。' },
      { title: '只留今晚能做的', detail: '从三件里挑出一件今晚能推进的，其余今天不再处理。' },
      { title: '给身体一个信号', detail: '做 4-7-8 呼吸 6 轮，让身体先知道现在安全。' }
    ],
    prompt: '最近考试让我有点焦虑，我想先慢下来。'
  },
  thoughts: {
    id: 'thoughts',
    label: '睡前胡思乱想',
    title: '睡前胡思乱想',
    intro: '睡前的念头不是问题，是它一直转个不停。给它们一个停放的地方。',
    steps: [
      { title: '设一个收尾时间', detail: '给今晚的思考定 5 分钟，时间到就停笔。' },
      { title: '把它们存放起来', detail: '每写一条都配上「明天几点处理」，交给明天的自己。' },
      { title: '回到身体感觉', detail: '把注意力放到呼吸和床垫的接触，做 4-7-8 呼吸。' }
    ],
    prompt: '到了晚上，我的脑子还是停不下来。'
  },
  dorm: {
    id: 'dorm',
    label: '宿舍难放松',
    title: '宿舍难放松',
    intro: '环境不安静的时候，可以先缩小自己的空间，而不是等环境变好。',
    steps: [
      { title: '缩小你的空间', detail: '戴上耳机或拉上帘子，把注意力收回到 1 平方米内。' },
      { title: '用声音盖住声音', detail: '播放雨声或湖水声，音量刚好盖住周围说话声。' },
      { title: '做一次身体扫描', detail: '从肩颈开始，把注意力一段一段往下移。' }
    ],
    prompt: '在宿舍里，我总是很难放松。'
  }
};

function findCounselor(id) {
  return counselors.find((item) => item.id === id) || null;
}

function findBook(id) {
  return bookDirectory.findBook(id);
}

function findTopic(id) {
  return topics[id] || null;
}

module.exports = {
  assets,
  counselors,
  featuredCounselors,
  books,
  suggestions,
  topics,
  findCounselor,
  findBook,
  findTopic
};
