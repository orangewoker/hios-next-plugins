# 小红书素材库

面向 HIOS Next Tauri 版重构的小红书公开素材采集节点。

## 功能

- 粘贴小红书公开笔记或 `xhslink.com` 分享链接。
- 由宿主 `network-request` 跟随短链并读取页面，不依赖 Electron `<webview>`。
- 从 Open Graph、页面图片和内嵌状态中提取高清图片候选。
- 单张或批量加入画布，继续从 `image` 端口连接下游节点。

## 说明

- 新版不再保存账号、Cookie 或登录态。
- 仅处理无需登录即可访问的公开分享页面；受限、已删除或需要验证码的内容无法解析。

## 安装

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/xiaohongshu-assets
```
