# 小红书素材库

在 HIOS Next 独立插件节点中扫码登录、浏览并采集小红书图片素材。

## 0.3.1

- 改用 HIOS 通用插件浏览器桥接协议，沙箱插件节点现在可以正常加载登录网页和执行右键采集。

## 0.3.0

- 浏览器界面与右键高清图片解析已迁入插件自己的 `runtime/index.html`。
- 插件可直接从 GitHub 更新并热重载，不再依赖主程序的插件 ID 专用分支。

安装 URL：`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/xiaohongshu-assets`

登录状态与采集素材仅保存在 HIOS 本机数据目录，不写入插件文件。
