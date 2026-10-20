# 本机开发者工具调试版

此版本仅把 services/secrets.js 的模型代理地址改成 http://127.0.0.1:8787/v1/chat/completions，没有修改界面。

1. 在本机微信开发者工具导入本目录（包含 project.config.json）。
2. 本调试版已在project.config.json和project.private.config.json中设置urlCheck:false。如果开发者工具仍使用旧设置，重新打开项目，并在“详情 → 本地设置”确认已勾选“不校验合法域名、web-view（业务域名）、TLS版本以及HTTPS证书”。此设置仅用于本机HTTP代理调试。
3. 重新编译，打开夜喵发送消息。代理必须在同一台电脑上持续运行。

本次修复时已在当前电脑启动代理并验证真实模型两轮回复、上下文记忆。此版本不包含密钥，也不会在导入后自动启动服务器。电脑重启或代理退出后，需按 docs/agent-chat-repair.md 配置服务端环境变量并重新启动 Node 代理。

手机真机中的127.0.0.1指向手机，无法连接电脑代理。真机及正式发布必须配置可访问的HTTPS代理、微信request合法域名，再替换services/secrets.js的baseUrl。

不要把这个本机调试地址直接用于发布。
