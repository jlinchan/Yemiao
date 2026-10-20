// 夜喵 system prompt 预览器：按真实装配链拼出完整 system prompt，并打印分段字数预算，
// 回答"夜喵到底注入了什么"。真实对话中另有话题行与用户近况段，可用参数模拟。
// 用法：
//   node tools/preview-system-prompt.js
//   node tools/preview-system-prompt.js --expert yalom
//   node tools/preview-system-prompt.js --book perlis-cbti --expert yalom
//   node tools/preview-system-prompt.js --personality 安静倾听 --out docs/design/system-prompt-preview.txt
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const options = { expert: '', book: '', personality: '', context: '', out: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--expert') options.expert = argv[i + 1] || '';
    else if (key === '--book') options.book = argv[i + 1] || '';
    else if (key === '--personality') options.personality = argv[i + 1] || '';
    else if (key === '--context') options.context = argv[i + 1] || '';
    else if (key === '--out') options.out = argv[i + 1] || '';
  }
  return options;
}

// 按装配链拼 prompt 并计算预算；不修改全局 wx（用临时桩读写偏好后还原）。
function compose(rawOptions) {
  const options = Object.assign({ expert: '', book: '', personality: '', context: '' }, rawOptions || {});
  const originalWx = global.wx;
  const store = {};
  global.wx = {
    getStorageSync: (key) => (key in store ? store[key] : ''),
    setStorageSync: (key, value) => { store[key] = value; return true; }
  };
  try {
    const nightPreferences = require('../services/night-preferences');
    const agentPersona = require('../utils/agent-persona');
    const agentVoice = require('../utils/agent-voice');
    const agentKnowledge = require('../utils/agent-knowledge');
    const agentClient = require('../services/agent-client');
    const experts = require('../experts/registry');
    const books = require('../books/registry');

    if (options.personality) nightPreferences.save({ personality: options.personality });
    const persona = agentPersona.buildPersonaPrompt();
    const expert = options.expert ? experts.buildExpertPrompt(options.expert) : '';
    const book = options.book ? books.buildBookPrompt(options.book) : '';
    const warnings = [];
    if (options.expert && !expert) {
      warnings.push(`未找到专家卡「${options.expert}」，可用：${experts.list().map((item) => item.name).join('、') || '（无）'}`);
    }
    if (options.book && !book) {
      warnings.push(`未找到书卡「${options.book}」，可用：${books.list().map((item) => item.name).join('、') || '（无）'}`);
    }

    const context = options.context || '';
    const prompt = agentClient.buildSystemPrompt('', context, persona, expert, book);
    const voice = agentVoice.buildVoicePrompt();
    const knowledge = agentKnowledge.buildKnowledgePrompt();
    const parts = [
      ['声音段（恒定）', voice.length],
      ['知识段（恒定）', knowledge.length],
      ['persona 段（个性化设置）', persona.length],
      ['专家段', expert.length],
      ['书卡段', book.length],
      ['近况 context 段', context.length]
    ];
    const known = parts.reduce((sum, item) => sum + item[1], 0);
    parts.push(['固定段（介绍 + 对话规则 + 推荐 + 推送 + 技能）', prompt.length - known]);
    parts.push(['合计', prompt.length]);
    return { prompt, parts, warnings, options };
  } finally {
    if (originalWx) global.wx = originalWx; else delete global.wx;
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = compose(options);
  result.warnings.forEach((line) => console.warn(`[警告] ${line}`));
  const lines = [
    '=== 夜喵 system prompt 预览 ===',
    `选项：expert=${options.expert || '（无）'}，book=${options.book || '（无）'}，personality=${options.personality || '（默认）'}`,
    '分段预算：',
    ...result.parts.map((item) => `  ${item[0]}：${item[1]} 字`),
    '─'.repeat(30),
    result.prompt,
    ''
  ];
  const output = lines.join('\n');
  if (options.out) {
    const outPath = path.resolve(ROOT, options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, output, 'utf8');
    console.log(`已写入 ${outPath}（prompt ${result.prompt.length} 字）`);
  } else {
    console.log(output);
  }
}

if (require.main === module) main();

module.exports = { compose, parseArgs };
