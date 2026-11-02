# DX Cut for HIOS — 0.2.5 预览版

## 0.2.6 液态玻璃更新

- 按钮、输入框、设置滑块、开关与菜单统一为液态玻璃材质，适配深色、浅色及彩色宿主主题。
- 保留原有编辑、定位、时间轴及输出流程；尊重减少动态效果和高对比度设置。


独立 React/TypeScript 剪辑器，基于 ReaCut 提交 `427742ee9022e68c44d9c9398331530b89678a53`。不加载 DXOS 页面、账户、数据库或 `/reacut` 服务；也不声称包含 DXOS 0.5.33 的全部定制。

## 2026-11-02 对齐范围

用户提供的 DXOS Portable 0.5.4 目录，实际活动宿主为 0.7.3，已安装 DX Cut 为 0.5.38（build 51）。安装物包含构建后的 JS/CSS，不是可直接合并的 TypeScript 源码。其 upstream.json 仍指向本插件相同的 ReaCut 基线；公开 MIT 上游当前 main 为 `7ba4c708657717168928b7c815274517b951366e`，包含另外一组字幕、模板和关键帧更新。两个分支不能混称为同一个版本。

本次独立适配：修复高清节点逻辑视口高度；新增画布设置入口（复用 Inspector 和工程更新命令）；新增工程备注（离开输入框提交、随工程持久化、可撤销）。保留 HIOS 助手、素材权限和 FFmpeg 导出链路。

实际验证：1/2/4 倍 iframe 缩放下时间线和播放控制完整可见，备注写入后端工程，真实 FFmpeg 导出、恢复不重复导入。GPU **导出编码**继续使用已有硬件探测/CPU 回退；0.2.4 新增独立实现的 WebGL 调色/抠像/蒙版路径；几何合成、文字和模糊仍沿用 Canvas2D，不宣称全 GPU 渲染。备注的其他可能交互、以及公开上游 0.7.x 的关键帧曲线/模板/离线语音尚未同步，不宣称全量兼容。

## 0.2.5 状态与全屏修复

GPU 在启动时检测上下文和着色器，空工程显示“已启用（按需）”；这不表示持续运算或保证硬件 GPU。全屏通过 CSS 临时覆盖根节点 zoom，退出后自动恢复宿主设置。新增 1/2/4 倍下全屏布局边界及倍率恢复检查。

## 0.2.4 GPU 与接缝

工具栏提供 GPU 预览开关。一个共享 WebGL 上下文负责逐像素调色、抠像和形状蒙版；关闭、创建失败、上下文丢失、纹理尺寸超限时使用原 CPU 路径。开启不保证特定硬件加速倍率（软件 WebGL 也可能可用），未做性能跑分。文本排版、变换/混合、模糊和最终导出保持原有实现。

每个视频片段保留独立解码源，提前 0.75 秒 seek 到下一片段 sourceIn。连续同轨硬切遇到未解码片段时，不提交不完整合成帧，并短暂保持播放时钟；1 秒超时退回上一完整帧、暂停并显示错误。真实空隙、隐藏轨道、跳转、编辑、换工程和输出尺寸变化使保持策略失效。

验证命令：`node scripts/test-dxcut-gpu.mjs`、`node scripts/test-dxcut-seams.mjs`、`node --test tests/dxcut-preview-continuity.test.mjs`。WebGL 与 CPU 像素对比最大误差 2/255（低 alpha RGB 不做直色差比较），测试 GPU 关闭和上下文丢失回退；真实红/绿前景及蓝色底轨视频验证延迟解码不露底、恢复、真实空隙、隐藏轨道。WebView2 正式安装环境和更多编码格式仍待实机覆盖。仅更新插件，不要求升级 HIOS 3.9.5。

## 安装

需要 **HIOS Next 3.6.2 或更新版本**，旧版宿主不支持本版拖放和时间线缩略帧，请先更新主程序。本次本机产物为 **Windows x64**；其他平台必须重新构建原生 Canvas 依赖。

在插件管理中“从本地目录安装”，选择打包脚本输出的目录，而非包含开发用 node_modules 的 source 目录。安装后提供应用“DX Cut 视频剪辑”和同名画布节点。需要 `filesystem`、`canvas`、`process`、`agent` 权限。官方插件库支持 GitHub / Gitee 双渠道。安装地址：`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/dx-cut`；国内镜像：`https://gitee.com/forlotus/hios-next-releases/tree/plugins/plugins/dx-cut`。

## 已接通

- 应用与画布复用同一编辑器，各自保存当前工程引用。
- 原生文件选择器导入视频、音频、图片；复制到 HIOS 数据目录后由 FFprobe 探测，生成缩略图、音频波形及必要的兼容预览代理。
- 支持拖入本地素材，单文件最大 240 MB；更大的文件请通过“导入素材”选择。
- 视频时间线按片段实际时间范围生成并缓存缩略帧。
- 节点接受 HIOS 本地素材引用，新增素材依次加入时间线；恢复和重复 init 不重复导入。远程 URL 先存入 HIOS 素材库；本版不替用户静默下载任意 URL。
- 多轨编辑、剪切、文本、变换、关键帧与基础效果沿用上游模型和渲染器。
- 自动保存及手动保存，工程重开、最近工程；乐观版本检查阻止另一编辑器的旧快照覆盖新文档。
- 原生 FFmpeg 自由时间线渲染，分辨率/帧率/范围按编辑器设置，不压缩为短剧镜头列表。
- 复用 HIOS 的 FFmpeg 路径与全局编码偏好；真实探测 NVENC/QSV/AMF，实际编码失败回退 CPU。取消任务不重试。
- 导出结果在 HIOS 数据目录中直接落盘，以素材 URL 输出至画布，避免传递大视频 Base64。“另存成片”可复制到用户指定目录。
- 完整 / ½ / ¼ 预览质量，只影响画布采样，不影响最终输出。

## DSH 剪辑助手

复用 HIOS 智能体的 `DshNativeCanvasManager` 与内置 DSH 运行时，读取原生模型列表，按编辑器 / 工程隔离持续会话。不启动 Codex / Claude CLI，不要求单独配置云端 API。

只发送用户问题、对话和不含路径的工程摘要，不发送媒体文件。返回的剪辑动作经过白名单、数量和参数校验，再由用户确认应用；工程已变化时拒绝旧建议。支持取消及失效任务清理。清空本地记录不会删除智能体原生会话。

原“云端与 API AI”为上游未实现功能的提示占位，现已移除；这不表示 DSH 所选模型一定在本地运行，模型仍按 HIOS 智能体配置调用。

已验证真实 FFmpeg 导出、应用和节点的主题下拉框及全屏；DSH 模型列表、建议与确认应用使用模拟后端做自动化测试，真实账号模型联调尚未完成。

## 当前未接通

内置素材库、倒放/定格派生素材、工程打包、剪映工程导入、字幕文件读写、外部素材重新链接及工程另存为。相关操作会明确报“尚未接入”，不返回虚假成功。文字/时间线内编辑不受字幕文件导入限制。

界面跟随 HIOS 浅色 / 深色主题，下拉框在 iframe 内绘制以兼容画布缩放；应用和节点均提供全屏编辑按钮（Esc 退出），不重新挂载编辑器。没有宣称所有图像效果都使用 GPU，也没有大工程性能对比数据。WebView2 实机验证及跨平台原生包尚未完成。

## 存储与引擎

`用户数据目录/asset-files/dx-cut/` 下包含 media、cache、projects、exports；插件卸载不会删除工程。工程 JSON 保存 `{project, revision}`，素材采用受控绝对路径和 HIOS URL，目前不支持跨机器便携搬迁。

引擎是插件自带的 STDIO MCP 子进程。前端通过受限 HIOS 桥接，只能选择文件、操作已导入素材及自己的导出任务；它不能直接运行任意命令。渲染器的 npm / Electron 开发依赖不进入安装包，不额外分发 FFmpeg。

## 构建与测试

```powershell
npm ci --ignore-scripts --prefix plugins/dx-cut/source
npm run typecheck --prefix plugins/dx-cut/source
node scripts/build-dxcut-plugin.mjs
npm run build --prefix plugins/dx-cut/source
node scripts/sync-plugin-ui.mjs
node scripts/package-dxcut-plugin.mjs
node --test tests/dxcut-engine.test.mjs
node scripts/test-dxcut-ui.mjs
# 应用协议链路（默认测试画布协议）
$env:DXCUT_TEST_APP = '1'
node scripts/test-dxcut-ui.mjs
Remove-Item Env:DXCUT_TEST_APP
```

真实引擎测试需要本地 FFmpeg/FFprobe，支持 `HIOS_FFMPEG_PATH`、`HIOS_FFPROBE_PATH` 覆盖。保留上游 MIT、第三方、字体及原生依赖许可。上游要求 Node 24.11+ / 26+；本机 Node 24.7 构建和测试通过不代表全部版本兼容。

实际验证：插件清单通过 PluginStore 本地安装；真实 MCP/FFmpeg 完成素材导入、带文字视频输出、工程重开、错误路径拒绝、版本冲突拒绝、跨会话任务隔离和取消。Electron 隐藏测试窗口验证应用/节点协议、保存重载及不重复导入，并检查编辑器截图。产物和截图留在 output/dxcut-tests 与 .codex-temp/dx-ui；未安装进用户正在运行的正式 HIOS。
