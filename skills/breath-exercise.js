// 技能：深呼吸放松。把用户带进呼吸世界（pages/breathe，分包）跟随光团做呼吸练习；
// 对话里只留一句接手的话，练习本身在呼吸页完成，返回后对话上下文还在。
module.exports = {
  name: 'breath_exercise',
  label: '深呼吸放松',
  prompt: [
    'breath_exercise：用户说想做深呼吸、带我放松一下、心跳快想平静、紧张想缓一缓时调用。',
    '参数：{"skill":"breath_exercise","args":{"world":"orb"}}',
    'world 固定取 orb（呼吸光团），不用改。',
    '调用后正文只写一句很短的开场（提醒跟随光团的节奏吸气呼气），不要自己写完整的呼吸引导词。'
  ].join('\n'),
  needsResult: false,
  writes: [],
  execute() {
    return {
      ok: true,
      message: '好，跟我做一次深呼吸。跟着光团的节奏：慢慢吸——缓缓呼——把节奏交给它。',
      action: { type: 'navigate', url: '/pages/breathe/index?world=orb' }
    };
  }
};
