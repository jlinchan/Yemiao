/**
 * 夜喵首页的内容与素材映射（单一数据源）
 *
 * - 素材路径集中在这里，页面不要各写一份。
 * - 咨询师、书中技能、快捷入口的文案来自 Figma 设计稿「首页 · 夜喵」。
 * - 书籍本身统一由 data/book-directory.js 提供，首页只取排序后的前三本。
 * - 这里的练习步骤、咨询师开场白都是本地内容，不依赖任何后端或 AI 接口。
 */

const bookDirectory = require('./book-directory');
const counselorDirectory = require('./counselor-directory');

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

const counselors = counselorDirectory.featuredCounselors;

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
  return counselorDirectory.findCounselor(id);
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
  books,
  suggestions,
  topics,
  findCounselor,
  findBook,
  findTopic
};
