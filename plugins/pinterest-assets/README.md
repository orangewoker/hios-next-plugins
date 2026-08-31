# Pinterest 素材库

在 HIOS Next 的画布悬浮窗口中登录、搜索并浏览 Pinterest。对任意 Pin 图片点击右键，即可解析 `i.pinimg.com/originals/` 原图并直接加入画布；原图不可用时自动回退到 1200px 高清版本。

## 功能

- 使用独立持久化登录会话，不影响系统浏览器。
- 支持 Pinterest 搜索、前进、后退与刷新。
- 右键识别 Pin 页面与 `srcset` 中的最高质量图片。
- 下载原图后自动创建图片节点并保存到 HIOS 素材库。
- 可由画布 AI 助手通过“打开 Pinterest 搜索……”调用。

## 安装

在 HIOS Next 的“插件管理 → 安装插件”中粘贴：

`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pinterest-assets`

需要包含 Pinterest 宿主适配器的 HIOS Next 版本。

