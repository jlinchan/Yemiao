/** 全部咨询师页的数据；与首页三张精选卡片分开，避免改动首页布局。 */
const home = require('./nightcat-content');
const assets = {
  garden: '/assets/counselors/moon-garden.png', back: '/assets/agent/icons/chevron-right-muted.png',
  search: '/assets/counselors/search.png', person: '/assets/counselors/person.png',
  chevron: '/assets/counselors/consult-chevron.png'
};
const categories = [
  { id: 'all', label: '全部' }, { id: 'emotion', label: '情绪支持' },
  { id: 'cognition', label: '认知成长' }, { id: 'relationship', label: '关系沟通' },
  { id: 'self', label: '自我探索' }, { id: 'sleep', label: '睡眠放松' }
];
const details = [
  { id: 'empathy', category: 'emotion', count: '1.2w',
    description: '无论你此刻多么疲惫，这里都有温柔的陪伴，让情绪被看见，被接纳，被好好安放。',
    tags: ['情绪疏导', '安全感', '自我接纳'] },
  { id: 'cognitive', category: 'cognition', count: '9.8k',
    description: '一起探索思维模式，识别不合理的信念，建立更积极、灵活的认知方式，让你在生活中拥有更多选择和力量。',
    tags: ['思维调整', '焦虑管理', '压力疏解'] },
  { id: 'relation', category: 'relationship', count: '7.1k',
    description: '在亲密关系、家庭关系、职场关系中，帮你看见自己的需求，学会沟通与表达，建立清晰而温暖的边界。',
    tags: ['亲密关系', '沟通表达', '边界感'] }
];
const standalone = {
  sleep: {
    id: 'sleep', name: '睡眠陪伴师', category: 'sleep', count: '5.6k',
    desc: '想太多，睡不着',
    description: '通过温柔的对话、呼吸练习和睡前引导，帮你缓解焦虑与思绪，慢慢放松下来，陪你安心度过每一个夜晚。',
    tags: ['睡前放松', '焦虑缓解', '睡眠引导'],
    homeTags: ['睡眠引导'],
    avatar: '/assets/counselors/sleep.jpg',
    prompt: '今晚先不用急着入睡。我们慢慢呼吸，把心里还放不下的事说一说，好吗？'
  },
  yalom: {
    id: 'yalom', name: '欧文·亚隆', category: 'self', count: '大师',
    desc: '心理大师同行疗愈',
    description: '以欧文·亚隆存在主义心理治疗中的真诚相遇、此时此地与死亡焦虑视角陪伴。不是冒充本人，也不替代专业治疗。',
    tags: ['跨时空对话', '深度共情'],
    homeTags: ['跨时空对话'],
    avatar: '/assets/counselors/yalom.jpg',
    prompt: '慢慢来。此刻最让你放不下的，是什么？'
  },
  growth: {
    id: 'growth', name: '成长引导师', category: 'self', count: '4.3k',
    desc: '迷茫找不到方向',
    description: '从情绪、认知、关系到人生方向，陪你一步步看见更真实的自己，建立内在力量，走向更有选择的人生。',
    tags: ['自我探索', '成长规划', '人生方向'],
    homeTags: ['自我探索', '成长规划'],
    avatar: '/assets/counselors/growth.jpg',
    prompt: '我们可以从你最在意的一件小事开始。最近，你希望自己在哪个方向有一点改变？'
  }
};

const counselors = ['sleep', 'yalom', 'empathy', 'cognitive', 'relation', 'growth'].map((id) => {
  if (standalone[id]) return standalone[id];
  const item = details.find((entry) => entry.id === id);
  return Object.assign({}, home.findCounselor(id), item, {
    avatar: `/assets/counselors/${id}.jpg`,
    homeTags: home.findCounselor(id).homeTags || home.findCounselor(id).tags
  });
});
// 陪伴者的对话人设（2026-10-19 女娲蒸馏法）：源卡在 docs/counselors/*.md
// （身份卡/心智模型/表达 DNA/诚实边界/来源），由 tools/build-counselors.js 提取
// NIGHTCAT-COUNSELOR 注入块生成 data/counselor-cards.js。运行时只读生成物，
// 与专家卡（experts/cards.js）管线同构。
const counselorCards = require('./counselor-cards');

function findCounselor(id) { return counselors.find((item) => item.id === id) || null; }

// 组装陪伴者 persona 段；id 未命中或无对应卡返回 ''（行为等同夜喵本体）。
// 供 agent-client 注入 system prompt（位于书卡之后、用户上下文之前）。
function buildCounselorPrompt(id) {
  const counselor = findCounselor(id);
  const card = counselor && counselorCards[counselor.id];
  if (!card) return '';
  return [
    `当前对话选择了陪伴者「${card.label}」。${card.intro}`,
    card.prompt,
    '陪伴者使用规则：',
    '- 对用户而言，此刻在听 TA 说话的就是这位陪伴者本人，不要自称夜喵。',
    '- 安全规则、知识库使用规则、输出协议（@@标记@@/推荐卡/技能）全部照常生效，陪伴者身份不改变这些机制。',
    '- 开场已经是该陪伴者的引导语；之后的回复延续 TA 的口吻与方法，不切换回夜喵的默认语气。',
    '- 不虚构该陪伴者的资质（不自称咨询师/治疗师），不提供医疗诊断；用户问起是谁，就说自己是好眠猫里的陪伴者。',
    '- 与用户个性化设置冲突时，以用户设置为准。'
  ].join('\n');
}

function filterCounselors(category, query) {
  const keyword = String(query || '').trim().toLowerCase();
  return counselors.filter((item) => (
    (category === 'all' || item.category === category)
    && (!keyword || [item.name, item.desc, item.description].concat(item.tags).join(' ').toLowerCase().includes(keyword))
  ));
}

// 陪伴者的开场问题（对话页 starter 芯片用）；未知 id 返回空数组。
function counselorStarters(id) {
  const card = id && counselorCards[id];
  return Array.isArray(card && card.starters) ? card.starters.slice() : [];
}
module.exports = { assets, categories, counselors, findCounselor, filterCounselors, buildCounselorPrompt, counselorStarters };
