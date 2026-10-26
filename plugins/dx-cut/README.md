# DX Cut for HIOS — 0.1.0 预览版

独立 React/TypeScript 剪辑器，基于 ReaCut 提交 `427742ee9022e68c44d9c9398331530b89678a53`。不加载 DXOS 页面、账户、数据库或 `/reacut` 服务；也不声称包含 DXOS 0.5.33 的全部定制。

## 安装

需要 **HIOS Next 3.4.5 或更新版本**（包含 `dxcut-request` 桥接）。旧版宿主不支持此插件。本次本机产物为 **Windows x64**；其他平台必须重新构建原生 Canvas 依赖。

在插件管理中“从本地目录安装”，选择打包脚本输出的目录，而非包含开发用 node_modules 的 source 目录。安装后提供应用“DX Cut 视频剪辑”和同名画布节点。需要 `filesystem`、`canvas`、`process` 权限。官方插件库支持 GitHub / Gitee 双渠道。安装地址：`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/dx-cut`；国内镜像：`https://gitee.com/forlotus/hios-next-releases/tree/plugins/plugins/dx-cut`。

## 已接通

- 应用与画布复用同一编辑器，各自保存当前工程引用。
- 原生文件选择器导入视频、音频、图片；复制到 HIOS 数据目录后由 FFprobe 探测，生成缩略图、音频波形及必要的兼容预览代理。
- 节点接受 HIOS 本地素材引用，新增素材依次加入时间线；恢复和重复 init 不重复导入。远程 URL 先存入 HIOS 素材库；本版不替用户静默下载任意 URL。
- 多轨编辑、剪切、文本、变换、关键帧与基础效果沿用上游模型和渲染器。
- 自动保存及手动保存，工程重开、最近工程；乐观版本检查阻止另一编辑器的旧快照覆盖新文档。
- 原生 FFmpeg 自由时间线渲染，分辨率/帧率/范围按编辑器设置，不压缩为短剧镜头列表。
- 复用 HIOS 的 FFmpeg 路径与全局编码偏好；真实探测 NVENC/QSV/AMF，实际编码失败回退 CPU。取消任务不重试。
- 导出结果在 HIOS 数据目录中直接落盘，以素材 URL 输出至画布，避免传递大视频 Base64。“另存成片”可复制到用户指定目录。
- 完整 / ½ / ¼ 预览质量，只影响画布采样，不影响最终输出。

## 当前未接通

AI 助手、内置素材库、倒放/定格派生素材、工程打包、剪映工程导入、字幕文件读写、外部素材重新链接及工程另存为。相关操作会明确报“尚未接入”，不返回虚假成功。文字/时间线内编辑不受字幕文件导入限制。用户拖放外部文件时将使用宿主文件选择流程。

目前保留上游深色编辑布局；没有宣称所有图像效果都使用 GPU，也没有大工程性能对比数据。WebView2 实机验证及跨平台原生包尚未完成。

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
