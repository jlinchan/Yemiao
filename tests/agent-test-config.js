// 自动化测试专用假配置，无真实供应商密钥/网络。
const config = require('../services/runtime-config');
config.modelGateway = {
  baseUrl: 'https://proxy.test/v1/chat/completions', apiKey: 'test-only', model: 'test-fast',
  verificationCode: '',
  channels: {
    reframe: { baseUrl: 'https://proxy.test/v1/chat/completions', apiKey: 'test-only', model: 'test-reframe', maxTokens: 4000 },
    deep: { baseUrl: 'https://proxy.test/v1/chat/completions', apiKey: 'test-only', model: 'test-deep', maxTokens: 20000 }
  }
};
config.difyKnowledge = undefined;
module.exports = config;
