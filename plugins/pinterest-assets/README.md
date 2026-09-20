# Pinterest 素材库

面向 HIOS Next Tauri 版重构的 Pinterest 公开素材采集节点。

## 功能

- 粘贴 Pinterest Pin、图板、`pin.it` 分享链接或 `pinimg.com` 图片地址。
- 由宿主 `network-request` 跟随短链并读取公开页面，不依赖 Electron `<webview>`。
- 从页面元数据和内嵌状态中提取 `pinimg.com/originals/` 原图。
- originals 不可用时自动尝试 `1200x` 图片。
- 单张或批量加入画布，并从 `image` 端口连接下游节点。

## 说明

新版不再保存 Pinterest Cookie 或登录态，仅处理公开可访问页面。

## 安装

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pinterest-assets
```
