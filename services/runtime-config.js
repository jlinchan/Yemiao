// 本地私有配置优先；公开仓库和 CI 中回退到无密钥示例配置。
try {
  module.exports = require('./secrets');
} catch (error) {
  module.exports = require('./secrets.example.js');
}
