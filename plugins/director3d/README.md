# 3D 导演台 · HIOS 可选插件

基于 Toonflow 的 3D 导演台迁移，提供应用与画布节点两种入口。不是 Codex 插件，不是内置应用，不随 HIOS 安装包默认分发。

## 安装

在 HIOS → 插件 → 从 GitHub 安装中粘贴：

`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/director3d`

安装后在“应用”打开 **3D 导演台**，或向画布添加 **3D 导演台** 节点。两种入口分别保存工程，节点实例之间相互独立。可通过 `.director3d` 工程互相导入。

**宿主要求：** 完整功能需要包含 2026-10-22 导演台通用接口适配的 HIOS 构建（插件 AI catalog 返回 `toolDecisionProtocol: local-tools/v1`，iframe 支持 Pointer Lock）。原有 3.2.0 发行包不一定包含这些接口；安装插件不会自动更新宿主。旧宿主仍可布景、记录镜头、手动运镜与导出，但 AI 工具编辑和第一人称取景须升级宿主。本版本未附带新的 HIOS 安装包。

## 使用

1. 默认有一个人偶。在“设置”中添加人偶；“场景 JSON”可以精确编辑几何体、材质、姿态和完整工程。
2. 点击画面进入第一人称取景。WASD 移动，空格 / Shift 升降，鼠标改变方向，滚轮调焦，左键 / Esc 退出。
3. “添加关键帧”或右键记录镜头，拖动缩略图调整顺序。“关键帧生成运镜”无需 AI：每个镜头间隔 3 秒。
4. AI：在 HIOS AI 路由中启用支持工具调用的文字模型，选择模型、描述场景与动作，点击“生成方案”。连接节点的文字与本地图片自动作为参考（最多 4 张、每张 6 MB）；不支持视频参考。应用模式直接输入文字。
5. 点击关键帧图片导出按钮输出 PNG；选择方案后导出预演视频。节点导出可在画布创建对应图片 / 视频节点；应用导出交由宿主保存素材。
6. “导出工程”输出 `.director3d` 文件，可在两种入口通过“导入工程”恢复。画布运行按钮输出第一个关键帧，没有关键帧时输出基础场景镜头，不会自动发起付费 AI 请求。

## 保存与 AI 行为

- JSON 工程保存到宿主素材目录；state 仅持有版本与素材 URL，不存放视频、截图或密钥。普通编辑延迟 800 ms 自动保存，退出前等待“已保存”。
- 导入、添加人偶、手动运镜和 AI 生成均经过结构校验、实际 WebGL 预览及磁盘保存后提交；失败保留原工程。保存失败可导出工程备份后重试。
- 所有方案共用基础场景。删除物体后，旧方案中对应轨道会被过滤。
- AI 使用插件本地 `readDocument` / `editDocument` 草稿工具；宿主只调用所选模型，不执行这些工具，不向插件提供密钥。模型工具调用记录作为后续回合上下文传递。
- 最多 40 轮 / 10 分钟，单次宿主调用最多 3 分钟；取消、错误、超限不提交草稿。模型需支持宿主 `completeToolDecision` 适配，非所有文字路由都支持工具调用。

## 导出限制

- 浏览器本地 WebGL 实时预演，不调用 AI 视频模型。没有音轨。
- 导出长边 960 像素；优先 MP4，不支持时自动使用 WebM。实时录制约等于方案时长，窗口隐藏会中止；文件最多 64 MiB。
- 支持基础几何体与 16 关节低多边形人偶；不包含 GLB/FBX 导入、IK、物理模拟或三维重建。
- 不支持远程网页图片直接作为 AI 参考，请先保存到 HIOS 本地素材。

## 开发

```powershell
npm ci
npm run typecheck
npm run build
```

提交 `runtime/` 预构建 HTML、JS、CSS。用户安装无需 npm、网络 CDN 或额外进程权限。Vue/Three.js 在沙箱 iframe 中运行，通过 HIOS 通用消息协议与宿主交互。

源码来源：Toonflow `30139c931e80476caa718b31684b86383c6e83ce` 的 `packages/nodes/director3dNode`，及该项目 `docs/director3dExtract` 提取包。迁移修改包含 HIOS 桥接、工程存储、工具编排、全屏自适应布局和 WebM 回退。原作者许可证见 `LICENSE`；依赖许可证见 `THIRD_PARTY_NOTICES.txt`。

验证脚本位于 HIOS 源码 `tests/director3d-ui-regression.cjs`：真实 Electron 沙箱、生产 PluginStore/PluginNodeHost/PluginApplicationHost/LocalDataStore/PluginAiService；AI 使用确定性测试模型，不冒充真实付费模型联调。Tauri/WebView2 须在对应发行构建继续验收。
