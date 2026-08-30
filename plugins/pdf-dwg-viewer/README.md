# HIOS PDF / DWG Viewer

一个可从 GitHub 安装的 HIOS Next 画布插件。它在隔离的插件节点中本地解析文件，不上传源文档。

## 功能

- 选择或拖入 `.pdf`、`.dwg`、`.dxf` 后自动创建查看器节点。
- PDF 支持多页切换、页码输入、旋转和 `Ctrl/Cmd + 滚轮` 缩放。
- DWG/DXF 支持平移、滚轮缩放、适合窗口和深浅背景。
- 自动排除损坏的视口范围和远离主体的异常坐标，避免图纸解析成功后只显示空白画布。
- “输出图片”会把当前 PDF 页面或 CAD 视口写入节点的 `image` 输出端口，可直接连接视觉 LLM、生图、ComfyUI、RunningHub、图片对比等下游节点。
- 页面、缩放、旋转、CAD 视口与背景会随画布保存并恢复。

## 安装

在 HIOS Next 的“插件管理 → 安装插件 → GitHub”输入：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pdf-dwg-viewer
```

本目录也可通过“本地插件”直接安装。插件需要支持 `schemaVersion: 1` 动态画布节点运行时的 HIOS Next 版本。

## 宿主兼容性

- 需要 HIOS Next `1.0.10` 或更高版本。
- 宿主必须支持 `hios-plugin-node/v1`、动态 `rendererEntry`、`fileAssociations.nodeId` 和 sandboxed iframe 插件节点。
- 旧版 HIOS 即使能读取 `schemaVersion: 1` 清单，也不一定具备动态节点宿主；请先升级应用再安装。

## 开发

```bash
npm install
npm run typecheck
npm run build
```

构建产物位于 `runtime/`，发布 GitHub 插件时必须一并提交。运行时包含 PDF.js worker，以及 CAD Viewer / LibreDWG 的 Worker 与 WebAssembly 文件。

## 插件消息协议

Renderer 在 sandboxed iframe 中运行，通过 `postMessage` 与宿主通信：

- Host → Plugin：`init`，包含节点 ID、文件 URL 和可序列化状态；`file-result` 返回插件请求的本地文件。
- Plugin → Host：`ready`、`request-file`、`state`、`loaded`、`output`、`error`。
- 插件启动后会有限次数重发 `ready`，直到收到 `init`，避免 iframe 首次加载时的握手竞态。
- `output` 的 `portId: "image"` 会映射到节点标准 `imageUrl`，因此可以被现有图片输入节点直接消费。

## 许可证

插件整体使用 `AGPL-3.0-only`。PDF.js 为 Apache-2.0；CAD Viewer 为 AGPL-3.0-only；LibreDWG WebAssembly 为 GPL-3.0。构建脚本会带齐 PDF.js 完整许可证、CAD Viewer 完整许可证和 NOTICE；LibreDWG 对应源码、精确版本与重建方式见 `THIRD_PARTY-LIBREDWG-SOURCE.md`。
