# 网页浏览器

面向 HIOS Next Tauri 版重构的轻量网页阅读与素材采集节点。

## 功能

- 输入 HTTP(S) 地址读取公开网页；输入普通文字时使用 Bing 搜索。
- 在插件内部生成正文、链接和图片阅读视图。
- 点击站内链接继续浏览，地址栏保留最终跳转地址。
- 将正文从 `text` 端口输出，或将选中图片从 `image` 端口输出并加入画布。
- 通过 `network-request` 使用宿主网络栈，不使用 Electron `<webview>`。

## 限制

这是安全阅读视图，不执行远程页面脚本。必须登录、依赖复杂前端运行时或带反爬校验的页面可能无法读取；此类页面可复制公开分享链接交给对应素材插件解析。

## 安装

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/web-browser
```
