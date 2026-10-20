// Dify 知识库检索桥（协作模式）：把用户消息发给 Dify 知识库做语义检索，
// 命中段落拼成可注入 system prompt 的知识块。与端内静态知识库
// （utils/agent-knowledge）叠加，不替换——静态条目是人工精选的兜底，
// 检索块提供长尾扩展；对话与技能调用仍走现有链路，不受影响。
//
// 配置（services/secrets.js）：
//   difyKnowledge: {
//     baseUrl: 'https://api.dify.ai/v1',
//     apiKey: 'dataset-xxxx',   // 知识库 API Key（「知识库」页生成，dataset- 开头，
//                               // 与应用 API Key app- 开头是两回事）
//     datasetId: 'xxxx',        // 知识库 ID
//     topK: 3
//   }
// 未配置（缺失/占位）时 enabled() 为 false，行为零变化；
// 检索失败或超时静默降级为空块，绝不阻塞对话主链路。

const secrets = require('./runtime-config');

const REQUEST_TIMEOUT_MS = 3000;
const MAX_HITS = 3;
const MAX_HIT_CHARS = 160;
const PLACEHOLDER = '填入';
// 相关性分数门槛（2026-10-19 修复「说什么都显示知识库援引」）：
// 此前 score_threshold_enabled 固定 false，Dify 无论相关性多低都返回 topK 条，
// 导致不相关发言也点亮「知识援引」卡、不相关段落还被注入 prompt 带偏回复。
// 现在服务端按阈值过滤 + 端上按返回的 record.score 二次过滤，双保险。
const DEFAULT_SCORE_THRESHOLD = 0.45;

function enabled() {
  const config = secrets && secrets.difyKnowledge;
  if (!config) return false;
  const key = typeof config.apiKey === 'string' ? config.apiKey.trim() : '';
  const dataset = typeof config.datasetId === 'string' ? config.datasetId.trim() : '';
  return (config.useProxy === true || Boolean(key) && key.indexOf(PLACEHOLDER) === -1) && Boolean(dataset);
}

// 相关性阈值：可在 secrets.difyKnowledge.scoreThreshold 覆盖；取 (0,1) 内数字，否则用默认值。
function scoreThreshold() {
  const config = secrets && secrets.difyKnowledge;
  const value = config && Number(config.scoreThreshold);
  return Number.isFinite(value) && value > 0 && value < 1 ? value : DEFAULT_SCORE_THRESHOLD;
}

function baseUrl() {
  return String((secrets.difyKnowledge && secrets.difyKnowledge.baseUrl) || 'https://api.dify.ai/v1').replace(/\/+$/, '');
}

// 端上分数过滤：Dify 返回 score 时低于阈值丢弃；未返回 score（异常响应/旧版接口）不误杀。
function passesScore(record) {
  const score = record && typeof record.score === 'number' ? record.score : NaN;
  return !Number.isFinite(score) || score >= scoreThreshold();
}

// 把检索结果收敛为知识块文本；空命中或异常返回 ''。
function formatHits(records, maxHits) {
  const list = Array.isArray(records) ? records : [];
  const limit = Number(maxHits) > 0 ? Math.min(Number(maxHits), MAX_HITS) : MAX_HITS;
  const lines = [];
  for (let i = 0; i < list.length && lines.length < limit; i += 1) {
    const record = list[i] || {};
    if (!passesScore(record)) continue;
    const segment = record.segment || {};
    const content = typeof segment.content === 'string' ? segment.content.trim() : '';
    if (!content) continue;
    const doc = segment.document && segment.document.name ? `（${segment.document.name}）` : '';
    lines.push(`- ${content.slice(0, MAX_HIT_CHARS)}${doc}`);
  }
  return lines.join('\n');
}

// 把文档文件名翻译成卡片上的友好来源标签。
const SOURCE_LABELS = [
  [/夜喵方法库/, '夜喵方法库'],
  [/蛤蟆先生|counselling-for-toads/i, '书卡 · 蛤蟆先生'],
  [/perlis|cbti/i, '书卡 · CBT-I 访谈指南'],
  [/临床专题/, 'Peace Lab · 临床专题'],
  [/心智心理/, 'Peace Lab · 心智心理'],
  [/生命科学/, 'Peace Lab · 生命科学'],
  [/学习路径/, 'Peace Lab · 学习路径'],
  [/危机资源|CRISIS/i, 'Peace Lab · 危机资源'],
  [/焦虑专题/, 'Peace Lab · 焦虑索引']
];

function sourceLabel(name) {
  const text = String(name || '');
  for (let i = 0; i < SOURCE_LABELS.length; i += 1) {
    if (SOURCE_LABELS[i][0].test(text)) return SOURCE_LABELS[i][1];
  }
  return text.replace(/\.md$/i, '').slice(0, 24) || '知识库';
}

// 把检索结果收敛为结构化命中（供前端渲染「知识援引」卡）：
// [{ source: 原始文件名, label: 友好标签, snippet: 摘录 }]；空命中或异常返回 []。
function buildHits(records, maxHits) {
  const list = Array.isArray(records) ? records : [];
  const limit = Number(maxHits) > 0 ? Math.min(Number(maxHits), MAX_HITS) : MAX_HITS;
  const hits = [];
  for (let i = 0; i < list.length && hits.length < limit; i += 1) {
    const record = list[i] || {};
    if (!passesScore(record)) continue;
    const segment = record.segment || {};
    const content = typeof segment.content === 'string' ? segment.content.trim() : '';
    if (!content) continue;
    const name = (segment.document && segment.document.name) || '';
    hits.push({ source: name, label: sourceLabel(name), snippet: content.slice(0, 200) });
  }
  return hits;
}

// 异步检索：done(blockText, hits) 总会被调用——成功给格式化块 + 结构化命中数组，
// 失败给 ('' , [])。query 为空或未配置时同步回调空值。返回 { abort() } 便于取消。
function retrieve(query, done) {
  let settled = false;
  let timer = null;
  let task = null;
  const callback = (block, hits) => {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (typeof done === 'function') done(block, hits);
  };
  const text = String(query || '').trim();
  if (!enabled() || !text) {
    callback('', []);
    return { abort() {} };
  }
  const config = secrets.difyKnowledge;
  const topK = Number(config.topK) > 0 ? Math.min(Number(config.topK), MAX_HITS) : MAX_HITS;
  try {
    timer = setTimeout(() => {
      callback('', []);
      if (task && task.abort) task.abort();
    }, REQUEST_TIMEOUT_MS);
    if (timer && timer.unref) timer.unref();
    task = wx.request({
      url: `${baseUrl()}/datasets/${config.datasetId}/retrieve`,
      method: 'POST',
      timeout: REQUEST_TIMEOUT_MS,
      header: config.apiKey ? { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` } : { 'Content-Type': 'application/json' },
      data: {
        query: text,
        retrieval_model: {
          top_k: topK,
          // 相关性阈值开启：低于阈值的段落 Dify 直接不返回（修复「说什么都有知识援引」）。
          score_threshold_enabled: true,
          score_threshold: scoreThreshold(),
          reranking_enable: false
        }
      },
      success(res) {
        if (res && res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) { callback('', []); return; }
        const records = res && res.data && res.data.records;
        callback(formatHits(records, topK), buildHits(records, topK));
      },
      fail() {
        callback('', []);
      }
    });
    return { abort() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (task && task.abort) task.abort();
    } };
  } catch (error) {
    callback('', []);
    return { abort() {} };
  }
}

module.exports = { enabled, retrieve, formatHits, buildHits, sourceLabel, MAX_HITS, MAX_HIT_CHARS };
