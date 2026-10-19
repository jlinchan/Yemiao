// services/secrets.js 的模板文件。
// 使用方法：复制本文件为 services/secrets.js（同目录），填入真实密钥。
// services/secrets.js 已加入 .gitignore，不会被提交；微信上传包需要它，请勿加入 packOptions.ignore。
module.exports = {
  modelGateway: {
    baseUrl: 'https://modelgateway.zju.edu.cn/v1/chat/completions',
    apiKey: '在此填入模型网关 API Key',
    model: 'deepseek-v4-flash-780k-local',
    // 验证码门禁：留空 = 不设限（默认，任何设备直接可对话）。
    // 若要开启分享门禁，在本机 secrets.js 里填入非空验证码即可，
    // 千万不要把占位文案留在这里——非空值会让所有无本地 secrets 的设备被锁死。
    verificationCode: ''
  },
  ocr: {
    url: 'https://mcp.zju.edu.cn/api/protal/proxy/system/layout-parsing',
    apiKey: '在此填入 OCR API Key'
  }
};
