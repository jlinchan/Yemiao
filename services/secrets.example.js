// 仅公开客户端配置。此地址必须改成你已部署、已加入 request 合法域名的 HTTPS 服务。
// 供应商 API Key 只放服务器环境变量，不能填写到本文件。
module.exports = {
  modelGateway: {
    baseUrl: 'https://your-api.example.com/v1/chat/completions',
    apiKey: '',
    model: 'sleepwell',
    verificationCode: '',
    channels: {
      reframe: { baseUrl: '', apiKey: '', model: '' },
      deep: { baseUrl: '', apiKey: '', model: '', maxTokens: 20000 }
    }
  },
  dify: { baseUrl: '', apiKey: '', promptVariable: 'prompt' },
  difyKnowledge: { useProxy: false, baseUrl: '', apiKey: '', datasetId: '', topK: 3, scoreThreshold: 0.45 },
  ocr: { url: '', apiKey: '' }
};
