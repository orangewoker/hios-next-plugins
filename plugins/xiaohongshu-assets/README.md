# 小红书素材库

在 HIOS Next 独立插件节点中扫码登录、浏览并采集小红书图片素材。

## 0.4.2

- 修复重复导入 Cookie 时覆盖已有 HttpOnly Cookie 导致的 `EXCLUDE_OVERWRITE_HTTP_ONLY` 错误。
- 导入前仅清理小红书插件自己的独立会话，再写入新 Cookie 并刷新页面。

## 0.4.1

- 修复 Cookie 设置面板被网页 WebView 原生层遮挡的问题。
- 设置打开时由通用浏览器协议临时切换控制层，关闭后自动恢复网页交互。

## 0.4.0

- 右下角新增“输出所选原图到画布”，可将当前右键选中的高清原图创建为画布图片节点。
- 宿主级图片右键菜单新增“保存原图到画布”。
- 设置面板支持粘贴 Cookie 登录和清除插件会话，同时保留扫码登录。
- Cookie、选图和原图输出均使用通用插件协议，不需要小红书专用宿主适配器。

## 0.3.1

- 改用 HIOS 通用插件浏览器桥接协议，沙箱插件节点现在可以正常加载登录网页和执行右键采集。

## 0.3.0

- 浏览器界面与右键高清图片解析已迁入插件自己的 `runtime/index.html`。
- 插件可直接从 GitHub 更新并热重载，不再依赖主程序的插件 ID 专用分支。

安装 URL：`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/xiaohongshu-assets`

登录状态与采集素材仅保存在 HIOS 本机数据目录，不写入插件文件。
