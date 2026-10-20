# Dify 知识库导入包

给 Dify「知识库」用的现成文档包。导入后配合 `services/secrets.js` 的 `difyKnowledge` 配置即可生效（见 `docs/dify-integration.md` 协作模式）。

## 导入哪些文件

| 文件 | 内容 | 公开分享 |
| --- | --- | --- |
| `夜喵方法库-睡眠与情绪.md` | 10 条人工精选方法（CBT-I 刺激控制、认知洗牌、4-7-8 呼吸、课题分离、NVC 等），自研内容 | ✅ 可开源 |
| `../books/counselling-for-toads.md` | 蛤蟆先生书卡（含**出版书原句引用**） | ❌ 仅限自用知识库 |
| `../books/perlis-cbti.md` | Perlis CBT-I 书卡（含**出版书原句引用**） | ❌ 仅限自用知识库 |

> ⚠️ 版权注意：两份书卡 md 含《蛤蟆先生去看心理医生》等出版书籍的直读原句（带出处定位）。
> **导入自己的私有 Dify 知识库没有问题；但不要把书卡文件上传到公开 GitHub 仓库或对外分发。**
> 公开分享只放 `夜喵方法库-睡眠与情绪.md`。

## 导入步骤（Dify）

1. 「知识库」→ 创建知识库（如 `sleepwell-kb`）。
2. 导入本目录的 `夜喵方法库-睡眠与情绪.md`，以及 `docs/books/` 的两份书卡 md。
3. 分段设置建议：分段标识符 `\n\n`，最大分段 400~500 tokens（方法库每条方法自带小标题，会被切成独立段落，检索粒度刚好是"单条方法"）。
4. 索引方式：高质量（向量化）；检索 topK 与端上 `difyKnowledge.topK`（默认 3）对应。
5. 「知识库 → API」生成 `dataset-` Key，连同知识库 ID 填进 `secrets.js`。

## 同步约定

方法库改动后重跑生成器保持包同步（与 build-books 同一管线纪律）：

```bash
node tools/build-dify-kb.js
```

`tests/dify-kb.test.js` 会校验生成文件与 `utils/agent-knowledge.js` 的 ENTRIES 一致，改了源码没重新生成会红。

## 外部现成资源（2026-10-18 调研）

- **Peace Lab Database（平静实验室知识库）**：4,922+ 篇结构化 Markdown 疗愈语料，含睡眠优化路径、失眠评估（ISI）、危机资源安全边界层，专为 RAG 组织。**许可 CC BY-NC-SA 4.0（署名-非商业-相同方式共享）**，大赛/学习用途合适，商业化需注意。检索 "peace-lab-database"。
- **HuggingFace `insomnia-dataset-with-cot-multiturn`**：失眠治疗师多轮对话数据集（英文，含思维链标注），适合做评估集或微调，不适合直接当 RAG 知识库。
