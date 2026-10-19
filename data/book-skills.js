/**
 * 书中技能目录：Book -> Skill[]。
 *
 * source 与 verification 分开保存，避免把“书籍核心概念”误写成
 * “已逐字核验的原书练习”。对话页按 skillId 读取这里的上下文。
 */

const skillsByBook = {
  'cbti-insomnia-perlis': [
    {
      id: 'cbti-sleep-diary',
      bookId: 'cbti-insomnia-perlis',
      title: '记录睡眠日记',
      desc: '用大致时间线观察睡眠规律。',
      icon: '/assets/agent/icons/notebook.png',
      concept: '睡眠日记记录上床、入睡、夜醒、起床和白天状态，重点看连续几晚的趋势，而不是单晚是否精确。',
      scenario: '只记得自己“整晚没睡”，却说不清入睡用了多久、夜里醒了多久。',
      questions: ['昨晚大约几点上床、几点睡着？', '夜里醒着的时间大概有多长？'],
      exercise: '只记录一晚的大致时间线，不反复看钟，允许有估计误差。',
      prompt: '我想学习《失眠的认知行为治疗》里的「记录睡眠日记」，请先讲清怎么按感觉记录，再陪我记录一晚。',
      source: 'docs/book-to-skill/失眠的认知行为治疗-逐次访谈指南.md §E.1；附录 1 p.147、第 5 章 p.95',
      verification: '核心公式与“趋势优先”表述已直读；完整日记字段待核。'
    },
    {
      id: 'cbti-sleep-beliefs',
      bookId: 'cbti-insomnia-perlis',
      title: '认识睡眠信念',
      desc: '看见越想控制睡眠越清醒的循环。',
      icon: '/assets/agent/icons/brain.png',
      concept: '对睡眠的担忧、灾难化预测和“必须马上睡着”的要求，可能让身体保持警觉。',
      scenario: '一躺下就想“今晚又完了”，随后开始反复看时间。',
      questions: ['今晚最让你紧张的那句话是什么？', '这是已经发生的事实，还是对今晚的预测？'],
      exercise: '写下一句睡眠担忧，再补一句更平衡、但仍然可信的表述。',
      prompt: '我想了解《失眠的认知行为治疗》里如何识别和反思不合理的睡眠想法，请从一个具体的睡前念头开始。',
      source: 'docs/books/perlis-cbti.md §3.1、§8.4；docs/book-to-skill/失眠的认知行为治疗-逐次访谈指南.md §E.5',
      verification: '认知治疗属于本书治疗组成已核；完整分类和逐条步骤待原书核验。'
    },
    {
      id: 'cbti-stimulus-control',
      bookId: 'cbti-insomnia-perlis',
      title: '建立睡眠联结',
      desc: '理解床与睡眠之间的条件联结。',
      icon: '/assets/agent/icons/bed-double.png',
      concept: '床反复与清醒、工作和挫败感配对时，会削弱入睡线索；刺激控制用于重新建立床与睡眠的联系。',
      scenario: '每天在床上刷手机、赶作业，真正想睡时反而越来越清醒。',
      questions: ['你躺下后最常在做什么？', '床上还有哪些活动让你保持清醒？'],
      exercise: '先记录三个“在床上保持清醒”的场景，不自行制定睡眠限制处方。',
      prompt: '我想了解《失眠的认知行为治疗》里的刺激控制，以及如何重新建立床和睡眠的联结。',
      source: 'docs/books/perlis-cbti.md §3.2；docs/book-to-skill/失眠的认知行为治疗-逐次访谈指南.md §E.3',
      verification: '原理已核；“15–20 分钟”为作者教材稿转引，完整流程待原书核验。'
    }
  ],
  courage: [
    {
      id: 'courage-task-separation',
      bookId: 'courage',
      title: '区分课题',
      desc: '分清哪些事属于自己，哪些属于他人。',
      icon: '/assets/agent/icons/crosshair.png',
      concept: '判断一件事是谁的课题，可以看“后果最终由谁承担”。别人怎么看你，是别人的课题；你如何回应，是你的课题。',
      scenario: '睡前反复回想白天说错的话，担心别人怎么评价自己。',
      questions: ['这件事的后果最终由谁承担？', '你正在替谁背负他的课题？'],
      exercise: '写下一件今晚反复想起的事，标注“我的课题”或“对方的课题”。',
      prompt: '我想学习《被讨厌的勇气》里的「课题分离」，请结合一个我反复担心别人看法的小事来聊。',
      source: 'docs/experts/adler.md §2.3【直读】',
      verification: '书籍核心概念已直读；本技能问题是基于概念新编。'
    },
    {
      id: 'courage-teleology',
      bookId: 'courage',
      title: '理解目的论',
      desc: '从行为追求的目的重新理解选择。',
      icon: '/assets/agent/icons/sparkles.png',
      concept: '目的论不把现在全部归因于过去，而是观察此刻的行为可能在保护什么、避免什么或争取什么。',
      scenario: '明明想睡，却一直刷手机到很晚，早上又责怪自己没有自制力。',
      questions: ['这段“再刷一会儿”的时间替你完成了什么？', '它在帮你避开哪一种感受？'],
      exercise: '挑一个最近重复出现的小行为，写下它可能服务的目的，不做道德评判。',
      prompt: '我想理解《被讨厌的勇气》里的「目的论」，请用一个睡前反复出现的小行为陪我分析，但不要把它变成责备。',
      source: 'docs/experts/adler.md §2.2【直读】',
      verification: '目的论与原因论的区分已直读；对创伤和真实伤害的边界已保留。'
    },
    {
      id: 'courage-community-feeling',
      bookId: 'courage',
      title: '共同体感觉',
      desc: '从贡献与归属理解自己的价值。',
      icon: '/assets/agent/icons/moon.png',
      concept: '共同体感觉把注意力从“我够不够好”转向“我与他人如何连接”，包含自我接纳、他者信赖和他者贡献。',
      scenario: '觉得今天什么都没做好，因此认定自己没有价值。',
      questions: ['今天有谁因为你的存在轻松过一点？', '你愿意怎样对待此刻不够好的自己？'],
      exercise: '写下一件很小、但对具体的人有帮助的事，不要求它被看见或表扬。',
      prompt: '我想了解《被讨厌的勇气》里的「共同体感觉」，请帮我从自我价值感和具体关系开始理解。',
      source: 'docs/experts/adler.md §2.4【直读】',
      verification: '共同体感觉三要素已直读；贡献感练习为夜喵新编。'
    }
  ],
  'mr-toad': [
    {
      id: 'mr-toad-ego-states',
      bookId: 'mr-toad',
      title: '认识自我状态',
      desc: '分辨儿童、父母与成人状态。',
      icon: '/assets/agent/icons/brain.png',
      concept: '沟通分析把当下状态分为儿童、父母和成人自我。被批评时瞬间变小，常是适应型儿童在保护自己。',
      scenario: '一犯错就听到心里有个挑剔的声音说“你怎么又这样”。',
      questions: ['刚才那个声音更像儿童、父母还是成人？', '如果是成人状态，它会怎么描述现在发生的事？'],
      exercise: '回忆一次自责，写下当时像孩子、像父母和像成人的三种说法。',
      prompt: '我想学习《蛤蟆先生去看心理医生》里的「儿童、父母与成人自我状态」，请从一次自责的场景开始。',
      source: 'docs/books/counselling-for-toads.md §2【直读】',
      verification: 'PAC 三种状态已直读；不用于诊断或给人贴标签。'
    },
    {
      id: 'mr-toad-emotions',
      bookId: 'mr-toad',
      title: '觉察情绪信号',
      desc: '允许情绪存在，看见它需要什么。',
      icon: '/assets/agent/icons/sparkles.png',
      concept: '悲伤、愤怒和恐惧不是故障，而是提示某部分需要被照顾。情绪需要先被承认，才更容易理解。',
      scenario: '明明没什么大事，却突然想哭，又马上责怪自己太脆弱。',
      questions: ['此刻最强的是哪种情绪？', '它如果会说话，想请你照顾什么？'],
      exercise: '给今天的情绪起一个名字，再写下它在身体里的位置和强度。',
      prompt: '我想学习《蛤蟆先生去看心理医生》里如何觉察和表达情绪，请先陪我看见此刻的情绪。',
      source: 'docs/books/counselling-for-toads.md §4【直读】',
      verification: '“情绪是信号”相关表述已直读；具体身体扫描练习为夜喵新编。'
    },
    {
      id: 'mr-toad-life-pattern',
      bookId: 'mr-toad',
      title: '看见旧模式',
      desc: '理解早期经历如何重复到今天。',
      icon: '/assets/agent/icons/crosshair.png',
      concept: '人生坐标与自证预言描述人如何不断用行为证明旧结论；看见模式不是责怪过去，也不是给现在定型。',
      scenario: '每次关系变得亲近，就开始讨好或提前退开，最后再次确认“果然没人会留下”。',
      questions: ['你好像在等哪一个旧结论被证明？', '这一次有没有一个细节和旧剧本不完全一样？'],
      exercise: '把一个重复的人际场景分成“旧结论、当时反应、结果”三栏。',
      prompt: '我想了解《蛤蟆先生去看心理医生》里的人生坐标和重复关系模式，请从一段反复出现的人际情境开始。',
      source: 'docs/books/counselling-for-toads.md §3【直读】',
      verification: '人生坐标与自证预言已直读；不替用户判定坐标或评判父母。'
    }
  ],
  inferiority: [
    {
      id: 'inferiority-compensation',
      bookId: 'inferiority',
      title: '自卑与补偿',
      desc: '把自卑感看成成长的动力。',
      icon: '/assets/agent/icons/brain.png',
      concept: '自卑感来自“想变得更好”与“现在还不够”的落差；问题不在有自卑，而在把它变成不行动的借口或虚假优越。',
      scenario: '看到同学表现很好，立刻觉得自己什么都不行，今晚也不想开始复习。',
      questions: ['这份落差在推动你，还是正在替你避开什么？', '如果只和理想的自己比，下一步是什么？'],
      exercise: '把“我不如别人”改写成一句描述成长方向的话，再写一个十分钟能开始的动作。',
      prompt: '我想学习《自卑与超越》里的「自卑与补偿」，请帮我把和别人比较转成可行动的成长方向。',
      source: 'docs/experts/adler.md §2.1【直读】',
      verification: '自卑感、自卑情结与补偿方向已直读。'
    },
    {
      id: 'inferiority-social-interest',
      bookId: 'inferiority',
      title: '社会兴趣',
      desc: '在合作与连接里找到位置。',
      icon: '/assets/agent/icons/sparkles.png',
      concept: '个体心理学用社会兴趣观察人格方向：关注他人、愿意合作，能让私人优越的竞争转向共同生活。',
      scenario: '小组合作里总想证明自己最厉害，反而很难真正听见别人。',
      questions: ['这个合作里，你更想赢过谁，还是想把事情一起做好？', '你能贡献的最小合作动作是什么？'],
      exercise: '在一次合作中选择一个“先听见对方需要”的动作，记录结果。',
      prompt: '我想理解《自卑与超越》里的社会兴趣和合作，请结合一个小组合作场景来聊。',
      source: 'docs/experts/adler.md §2.4【直读】',
      verification: '社会兴趣与合作方向已直读；练习为夜喵新编。'
    },
    {
      id: 'inferiority-life-tasks',
      bookId: 'inferiority',
      title: '人生三任务',
      desc: '从工作、交友与爱理解生活。',
      icon: '/assets/agent/icons/graduation-cap.png',
      concept: '阿德勒把人生任务概括为职业、社会交友与亲密关系；意义感来自如何回应这些无法回避的关系。',
      scenario: '最近学习、朋友和亲密关系都一团乱，不知道应该先处理什么。',
      questions: ['职业、交友、爱这三块里，哪一块现在最消耗你？', '这一周能对它做一个什么小回应？'],
      exercise: '给三个生活任务各写一句现状，只挑一个安排本周最小行动。',
      prompt: '我想了解《自卑与超越》里的人生三大任务，请帮我梳理工作、交友和亲密关系目前的优先级。',
      source: 'docs/experts/adler.md §2.4【直读】',
      verification: '三大任务框架已直读；具体排序为夜喵引导方法。'
    }
  ],
  talk: [
    {
      id: 'talk-defense-awareness',
      bookId: 'talk',
      title: '看见心理防御',
      desc: '理解自己如何绕开真正的问题。',
      icon: '/assets/agent/icons/brain.png',
      concept: '人走进咨询时带来的“表面问题”，有时是在保护自己不去碰更难受、更核心的议题。',
      scenario: '一直说“只是最近太忙”，但每次谈到关系就会迅速换话题。',
      questions: ['每次快碰到真正难受的地方，你会怎么转开？', '这个回避在保护你免于什么感受？'],
      exercise: '写下最近一次转移话题前发生了什么，不评判自己为什么要躲。',
      prompt: '我想从《也许你该找个人聊聊》的视角理解心理防御与自我回避，请从一个我反复绕开的话题开始。',
      source: '《也许你该找个人聊聊》公开主题与作者 Lori Gottlieb 的咨询叙事；未直读中文版原文',
      verification: '书籍主题已核；具体案例、页码与练习表述待核。'
    },
    {
      id: 'talk-relationship-pattern',
      bookId: 'talk',
      title: '重复的关系模式',
      desc: '辨认总在重演的人际剧本。',
      icon: '/assets/agent/icons/crosshair.png',
      concept: '关系中的重复模式常包含相似的期待、担心和反应；看见重复不是责怪自己，而是增加重新选择的空间。',
      scenario: '在不同关系里都害怕被抛下，于是先表现得冷淡或过度付出。',
      questions: ['这段关系里最熟悉的感觉是什么？', '你通常用什么方式保护自己？'],
      exercise: '写下一段反复出现的关系情境，分别记录期待、担心和自动反应。',
      prompt: '我想了解《也许你该找个人聊聊》里反复出现的人际关系模式，请从一段让我熟悉又疲惫的关系开始。',
      source: '《也许你该找个人聊聊》公开主题：治疗关系、亲密关系与重复模式；未直读原文',
      verification: '主题方向已核；未把书中的具体案例当作用户经历。'
    },
    {
      id: 'talk-vulnerability',
      bookId: 'talk',
      title: '表达脆弱',
      desc: '让真实感受有机会被听见。',
      icon: '/assets/agent/icons/sparkles.png',
      concept: '面对真实情绪和表达脆弱不是失控，而是停止独自承担；表达可以让关系有机会回应真实的需要。',
      scenario: '明明很需要陪伴，却说“没事，我自己可以”。',
      questions: ['如果不用逞强，你此刻最想被听见的是什么？', '你希望对方怎样陪你，而不是替你解决？'],
      exercise: '用“我现在感到……，我希望你能……”写一句不必发出去的话。',
      prompt: '我想学习《也许你该找个人聊聊》里表达脆弱和面对真实情绪，请陪我写出一句真实的感受与需要。',
      source: '《也许你该找个人聊聊》公开主题：脆弱、真实情绪与咨询关系；未直读原文',
      verification: '书籍主题已核；“我感到/我希望”句式是新编表达练习。'
    }
  ],
  nvc: [
    {
      id: 'nvc-observation',
      bookId: 'nvc',
      title: '观察与评论',
      desc: '先描述事实，再表达看法。',
      icon: '/assets/agent/icons/file-text.png',
      concept: '观察描述可被看见、听见的事实；评论加入了解释和评价。把两者分开，沟通更容易被听进去。',
      scenario: '室友没洗碗，你脱口而出“你总是这么自私”。',
      questions: ['只描述看到的事实，会怎么说？', '“总是”和“自私”分别增加了什么解释？'],
      exercise: '把一句带评价的话改写成只包含时间、行为和数量的观察。',
      prompt: '我想学习《非暴力沟通》里的「区分观察与评论」，请帮我把一句正在生气时想说的话改成具体观察。',
      source: '《非暴力沟通》公开核心框架：观察、感受、需要、请求；未直读中文版原文',
      verification: '四要素框架已核；中文版页码和译者表述未核。'
    },
    {
      id: 'nvc-feelings-needs',
      bookId: 'nvc',
      title: '感受与需要',
      desc: '穿过指责，找到真正的需要。',
      icon: '/assets/agent/icons/brain.png',
      concept: '感受不是评价，需要也不是策略。看见感受背后的需要，能让请求从指责转向连接。',
      scenario: '对方回消息很慢，你既生气又失落，开始想直接冷战。',
      questions: ['这份生气下面还有什么感受？', '你在乎的需要是尊重、回应还是安全感？'],
      exercise: '写下“我感到……因为我需要……”，只探索，不急着要求对方。',
      prompt: '我想理解《非暴力沟通》里的感受与需要，请从不被回应时产生的生气和失落到慢慢看清需要。',
      source: '《非暴力沟通》公开核心框架：区分感受、想法与需要；未直读中文版原文',
      verification: '核心框架已核；具体需要词表和练习为本项目新编。'
    },
    {
      id: 'nvc-request',
      bookId: 'nvc',
      title: '清晰请求',
      desc: '把期待变成具体可回应的行动。',
      icon: '/assets/agent/icons/send.png',
      concept: '有效请求具体、可执行、允许对方回应；要求或命令则把不服从解释成拒绝。',
      scenario: '你想被关心，却只说“你根本不在乎我”，对话立刻进入防御。',
      questions: ['你希望对方具体做什么？', '这个请求是否允许对方说不或提出别的办法？'],
      exercise: '把“你多关心我一点”改写成一个有时间、有行为的请求。',
      prompt: '我想学习《非暴力沟通》里的清晰请求，请帮我把一句模糊的期待改成具体、允许商量的请求。',
      source: '《非暴力沟通》公开核心框架：请求与要求的区别；未直读中文版原文',
      verification: '核心框架已核；具体例句为新编。'
    }
  ]
};

function listSkills(bookId) {
  return (skillsByBook[bookId] || []).slice();
}

function findSkill(bookId, skillId) {
  return listSkills(bookId).find((skill) => skill.id === skillId) || null;
}

module.exports = {
  skillsByBook,
  listSkills,
  findSkill
};
