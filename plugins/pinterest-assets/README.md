# Pinterest 素材库

在 HIOS Next 的独立插件节点中登录、搜索并浏览 Pinterest。对任意 Pin 图片点击右键，即可解析 `i.pinimg.com/originals/` 原图并从图片端口输出。

## 0.3.1

- 修复 Cookie 设置面板被网页 WebView 原生层遮挡的问题。
- 设置打开时由通用浏览器协议临时切换控制层，关闭后自动恢复网页交互。

## 0.3.0

- 右下角新增“输出所选原图到画布”，可把当前右键选中的原图直接创建为画布图片节点。
- 宿主级图片右键菜单新增“保存原图到画布”。
- 设置面板支持粘贴 Cookie 登录和清除插件会话，同时保留 Pinterest 网页的正常登录流程。
- 登录、选图、原图解析和输出均通过通用插件协议实现，不需要 Pinterest 专用宿主适配器。

## 0.2.1

- 改用 HIOS 通用插件浏览器桥接协议，修复沙箱 iframe 内 Electron WebView API 无法激活的问题。

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

