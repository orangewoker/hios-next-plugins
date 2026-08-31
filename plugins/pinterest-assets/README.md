# Pinterest 素材库

在 HIOS Next 的独立插件节点中登录、搜索并浏览 Pinterest。对任意 Pin 图片点击右键，即可解析 `i.pinimg.com/originals/` 原图并从图片端口输出。

## 0.2.0

- 浏览器界面、右键识图和原图解析全部迁入插件自己的 `runtime/index.html`。
- GitHub 更新后直接热重载，不再依赖主程序中的 Pinterest 专用 React 组件。

## 功能

- 使用独立持久化登录会话，不影响系统浏览器。
- 支持 Pinterest 搜索、前进、后退与刷新。
- 右键识别 Pin 页面与 `srcset` 中的最高质量图片。
- 下载原图后自动创建图片节点并保存到 HIOS 素材库。
- 可由画布 AI 助手通过“打开 Pinterest 搜索……”调用。

## 0.1.2

- 修复插件刚打开时自适应缩放早于 Electron WebView `dom-ready` 执行导致的启动报错。

## 0.1.1

- 修复“继续使用 Google 帐户登录”点击后没有反应的问题，OAuth 登录窗口会复用 Pinterest 的持久会话。
- Pinterest 浮动窗口缩小时，页面会随可用宽度自动缩放，工具栏也会切换为紧凑布局。

## 安装

在 HIOS Next 的“插件管理 → 安装插件”中粘贴：

`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pinterest-assets`

需要包含 Pinterest 宿主适配器的 HIOS Next 版本。

