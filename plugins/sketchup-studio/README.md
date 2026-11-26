# SketchUp 建模 (`sketchup-studio`)

HIOS Next 画布节点插件：用 DSH 智能体直接操控本机已安装的 **SketchUp 2021–2027**（多版本可选）完成 3D 建模、已有模型修改、多样式视口底图抓取，并直接串联 HIOS 画布下游的 AI 渲染 / 生图节点。

## 核心功能

- **多版本管理与自动桥接**：自动扫描本机已安装的 SketchUp 版本（如 SketchUp 2026 / 2027），一键选择版本、安装/升级 Ruby 桥接插件（`v1.1.0`）并启动连接。
- **实时画布建模与修改**：支持纯文字、多张参考图（上传/拖入/画布上游连线）驱动 DSH 调用 Ruby API 建模；所有建模操作自动包裹在单一可 `Ctrl+Z` 撤销的事务中。
- **AI 渲染底图样式栏**：视口内一键切换 **材质 / 纯白模 / 线框** + **阴影开关**，配合 **当前 / 轴测 / 正视 / 顶视** 及模型内已有 **场景（Scenes）** 抓图，并直接输出到画布下游 `视口预览图 (preview)` 端口。
- **模型导出与撤销**：支持在节点内一键撤销、保存 `.skp` 或导出 `.dae / .obj / .stl / .fbx` 并输出到 `模型文件 (model)` 端口。
- **一键同步首页 DSH**：在节点工具抽屉中点击「同步到首页 DSH」，即可把同一套 SketchUp MCP 引擎共享给 HIOS 首页的 DSH 对话窗口使用。

## 安装方式

在 HIOS Next 的 **插件管理 → 安装第三方插件** 中粘贴：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/sketchup-studio
```

安装后在画布中添加 **SketchUp 建模** 节点即可使用。首次安装或升级桥接后，若 SketchUp 已在运行，请重启一次对应版本的 SketchUp 以加载最新 Ruby 桥接。

## 安全说明

- SketchUp Ruby 桥接仅监听本机回环地址 `127.0.0.1` 随机端口，强制 `Bearer` 随机令牌鉴权，拒绝带浏览器 `Origin` 头的跨站请求。
- 所有模型修改均在 SketchUp 主线程通过 `start_operation` 执行，随时可在节点或 SketchUp 中按 `Ctrl+Z` 撤销。
