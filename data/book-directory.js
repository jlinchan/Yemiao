/**
 * 夜喵书籍与书中技能的唯一运行时目录。
 *
 * 首页、完整列表、书籍介绍页和对话入口都从这里取数：
 * - pinned 优先，其次 sortOrder 升序；
 * - 同一 id 只保留第一条，避免缓存或重复配置造成多份书卡；
 * - 首页只取前三本，完整列表仍使用去重后的全部书籍。
 */

const bookSkills = require('./book-skills');

const RAW_BOOKS = [
  {
    id: 'cbti-insomnia-perlis',
    title: '失眠的认知行为治疗',
    fullTitle: '失眠的认知行为治疗：逐次访谈指南',
    subtitle: '逐次访谈指南',
    desc: '循序学习失眠认知行为疗法',
    shortDescription: '循序学习失眠认知行为疗法',
    summary: '循着逐次访谈的结构，认识失眠背后的认知与行为因素，理解睡眠日记、行为调整和认知干预等方法的基本原理。',
    introduction: '循着逐次访谈的结构，认识失眠背后的认知与行为因素，理解睡眠日记、行为调整和认知干预等方法的基本原理。这本书面向希望理解 CBT-I 的专业学习者，也能帮助普通读者认识科学睡眠知识。具体治疗实施仍需结合专业评估。',
    author: '帕里斯 等著',
    authors: ['Michael L. Perlis', 'Carla Benson-Jungquist', 'Donn A. Posner', 'Michael T. Smith'],
    translator: '张斌',
    publisher: '人民卫生出版社',
    publishedYear: '2012',
    isbn: '9787117153584',
    originalTitle: 'Cognitive Behavioral Treatment of Insomnia: A Session-by-Session Guide',
    cover: '/assets/books/cbti-insomnia-perlis.jpg',
    coverLarge: '/assets/books/cbti-insomnia-perlis-large.jpg',
    coverType: 'concept',
    coverNote: '夜喵概念封面，非出版社官方封面',
    hero: '/assets/home/night-bg.jpg',
    tags: ['睡眠科学', 'CBT-I', '访谈指南'],
    categories: ['sleep'],
    pinned: true,
    sortOrder: 0,
    contentStatus: 'partial',
    statusNote: '书目信息已登记；逐次访谈的完整蒸馏仍待补充原书扫描件后核验。',
    sourceReference: 'docs/book-to-skill/失眠的认知行为治疗-逐次访谈指南.md',
    conversationPrompt: '我想了解《失眠的认知行为治疗》里的睡眠日记、刺激控制和认知调整。',
    minutes: 7,
    steps: [
      { title: '记录一晚', detail: '只记录上床、入睡、夜醒和起床的大致时间，不追求精确到分钟。' },
      { title: '观察规律', detail: '看看卧床时间与实际睡眠时间之间相差多少。' },
      { title: '认识边界', detail: '睡眠限制等临床干预需要在专业评估和指导下进行，不自行制定处方。' }
    ],
  },
  {
    id: 'courage',
    title: '被讨厌的勇气',
    subtitle: '阿德勒心理学对谈',
    desc: '学会课题分离，释放他人期待',
    shortDescription: '学会课题分离，放下期待',
    summary: '把「别人的期待」和「自己的课题」分开，先从一件小事练习松手。',
    introduction: '以阿德勒心理学的对谈展开，讨论课题分离、人际关系与自我接纳。页面中的练习用于理解概念，不替代专业心理咨询。',
    author: '岸见一郎 · 古贺史健',
    authors: ['岸见一郎', '古贺史健'],
    translator: '渠海霞',
    publisher: '机械工业出版社',
    cover: '/assets/home/cover-courage.jpg',
    coverLarge: '/assets/home/cover-courage.jpg',
    hero: '/assets/home/night-bg.jpg',
    tags: ['课题分离', '边界感', '自我认同'],
    categories: ['growth', 'acceptance'],
    pinned: false,
    sortOrder: 10,
    contentStatus: 'ready',
    minutes: 5,
    steps: [
      { title: '写下此刻的期待', detail: '想一件最近让你有压力的事，写下「谁在期待我做什么」。' },
      { title: '划出课题边界', detail: '在那句话后面补一句：「这是谁的课题」。' },
      { title: '做一次小小松手', detail: '挑其中最小的一件事，今天先不替对方完成它。' }
    ],
    breathSeconds: 240
  },
  {
    id: 'mr-toad',
    title: '蛤蟆先生去看心理医生',
    subtitle: '沟通分析（TA）故事',
    desc: '认识情绪，照顾真实的自己',
    shortDescription: '认识情绪，照顾真实自己',
    summary: '给情绪起个名字，再问它需要什么，而不是先批评自己。',
    introduction: '借蛤蟆先生的咨询故事认识情绪、自我状态和关系模式。它是通俗心理读物，不替代专业咨询或诊断。',
    author: '罗伯特·戴博德',
    authors: ['Robert de Board'],
    translator: '陈赢',
    cover: '/assets/home/cover-toad.jpg',
    coverLarge: '/assets/home/cover-toad.jpg',
    hero: '/assets/home/night-bg.jpg',
    tags: ['情绪识别', '自我关怀', '心理成长'],
    categories: ['emotion', 'acceptance'],
    pinned: false,
    sortOrder: 20,
    contentStatus: 'ready',
    minutes: 6,
    steps: [
      { title: '说出今天的情绪', detail: '用三个词描述今天，从最强烈的那个开始。' },
      { title: '给情绪找位置', detail: '感受它在身体的哪里，是紧、是沉，还是发烫。' },
      { title: '回应它的需要', detail: '写下此刻最想听到的一句话，自己对自己说一遍。' }
    ],
    breathSeconds: 300
  },
  {
    id: 'inferiority',
    title: '自卑与超越',
    subtitle: '个体心理学',
    desc: '接纳不完美的自己，走向成长',
    shortDescription: '接纳不完美，走向成长',
    summary: '把「我不够好」改写成「我还在长」，用一次小行动代替自我攻击。',
    introduction: '从个体心理学视角理解自卑感、合作与社会兴趣。具体版本信息以你阅读的译本为准。',
    author: '阿尔弗雷德·阿德勒',
    authors: ['Alfred Adler'],
    cover: '/assets/home/cover-inferiority.jpg',
    coverLarge: '/assets/home/cover-inferiority.jpg',
    hero: '/assets/home/night-bg.jpg',
    tags: ['自我接纳', '成长思维', '内在力量'],
    categories: ['growth', 'acceptance'],
    pinned: false,
    sortOrder: 30,
    contentStatus: 'ready',
    minutes: 7,
    steps: [
      { title: '找出那句评价', detail: '写出今天最常出现的那句自我评价。' },
      { title: '换成成长句式', detail: '把它改写为「我还在练习……」，只描述过程。' },
      { title: '安排一次小行动', detail: '选一件 10 分钟内能完成的事，做完就算过关。' }
    ],
    breathSeconds: 300
  },
  {
    id: 'talk',
    title: '也许你该找个人聊聊',
    subtitle: '心理咨询室里的故事',
    desc: '理解情绪背后的故事，练习表达需要',
    shortDescription: '理解情绪背后的故事',
    summary: '理解情绪背后的故事，先把想说的话说给值得信任的人听。',
    introduction: '从咨询室故事理解情绪、关系与求助过程。页面中的练习用于自我表达，不替代治疗关系。',
    author: '洛莉·戈特利布',
    authors: ['Lori Gottlieb'],
    cover: '/assets/home/cover-courage.jpg',
    coverLarge: '/assets/home/cover-courage.jpg',
    hero: '/assets/home/night-bg.jpg',
    tags: ['情绪理解', '表达沟通', '自我探索'],
    categories: ['emotion', 'relationship'],
    pinned: false,
    sortOrder: 40,
    contentStatus: 'ready',
    minutes: 8,
    steps: [
      { title: '找到一件小事', detail: '写下最近反复想起的一件事。' },
      { title: '说出真实感受', detail: '用“我感到……”描述它，不急着解释。' },
      { title: '表达一个需要', detail: '写下你希望对方怎样陪伴你。' }
    ]
  },
  {
    id: 'nvc',
    title: '非暴力沟通',
    subtitle: '观察、感受、需要与请求',
    desc: '听见彼此的需要，让沟通更清晰',
    shortDescription: '听见需要，表达清楚请求',
    summary: '从观察、感受、需要和请求开始，让一次沟通少一点猜测。',
    introduction: '用观察、感受、需要和请求梳理一次沟通。它是沟通练习框架，不替代冲突调解或心理治疗。',
    author: '马歇尔·卢森堡',
    authors: ['Marshall B. Rosenberg'],
    cover: '/assets/home/cover-toad.jpg',
    coverLarge: '/assets/home/cover-toad.jpg',
    hero: '/assets/home/night-bg.jpg',
    tags: ['倾听', '表达需要', '关系修复'],
    categories: ['relationship', 'emotion'],
    pinned: false,
    sortOrder: 50,
    contentStatus: 'ready',
    minutes: 8,
    steps: [
      { title: '只描述观察', detail: '把评价换成可被看见的事实。' },
      { title: '说出感受需要', detail: '分别写下你的感受和在乎的需要。' },
      { title: '提出具体请求', detail: '用一句清晰、可执行的话发出请求。' }
    ]
  }
];

function normalizedBooks() {
  const seen = new Set();
  return RAW_BOOKS
    .map((book, index) => Object.assign({}, book, {
      _sourceIndex: index,
      skills: bookSkills.listSkills(book.id)
    }))
    .filter((book) => {
      if (!book.id || seen.has(book.id)) return false;
      seen.add(book.id);
      return true;
    })
    .sort((left, right) => {
      const pinDiff = Number(Boolean(right.pinned)) - Number(Boolean(left.pinned));
      if (pinDiff) return pinDiff;
      const orderDiff = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
      return orderDiff || left._sourceIndex - right._sourceIndex;
    })
    .map(({ _sourceIndex, ...book }) => book);
}

const books = normalizedBooks();
const featuredBooks = books.slice(0, 3);

function listBooks() {
  return books.slice();
}

function findBook(id) {
  return books.find((book) => book.id === id) || null;
}

module.exports = {
  books,
  featuredBooks,
  listBooks,
  findBook
};
