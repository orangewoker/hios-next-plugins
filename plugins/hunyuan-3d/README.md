# 混元3D

HIOS NEXT 独立应用插件，支持腾讯混元生3D OpenAI 兼容接口和腾讯云 API 3.0。

## 功能

- 文生3D、单图生3D和多视图生3D
- 3.0 / 3.1 模型、PBR、面数、LowPoly / Geometry / Sketch
- 任务状态轮询与本地历史
- GLB / GLTF / OBJ / FBX / STL 三维预览，支持 ZIP 模型包中的纹理资源
- 自动跟随 HIOS NEXT 的亮色、暗色主题，并在切换主题时实时更新
- 线框、网格、坐标轴、灯光与材质调节
- 模型下载与本地缓存（优先使用缓存，避免任务链接到期后无法下载）
- 画布“混元3D生成”节点：文字、单图或多视图图片输入，模型文件、预览图片和结果 JSON 输出

## 安装

在 HIOS NEXT 的插件管理页中使用 GitHub 地址安装：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/hunyuan-3d
```

HIOS NEXT 需要包含插件应用 `network-request` 协议的主程序。目前该支持已提交到 HIOS NEXT 的 `Tauri` 分支；旧版主程序无法通过插件单独补齐此能力。

安装后从应用页打开“混元3D”，在右上角“API 设置”中填写自己的密钥。OpenAI 兼容接口仅支持专业版；腾讯云 API 3.0 支持专业版和极速版。此插件不附带 API Key，生成费用由所配置的账号承担。

图片模式下，普通生成仅发送图片，不同时发送提示词；使用 3.0 Sketch 模式时才可补充提示词。上传的图片以原始 Base64 提交，避免兼容接口对 `ImageUrl.Url` 数据 URL 返回 `Invalid param`。

## API 配置

### OpenAI 兼容模式

- Base URL：`https://api.ai3d.cloud.tencent.com`
- API Key：在腾讯混元生3D控制台创建

### 腾讯云 API 3.0

- Endpoint：`https://ai3d.tencentcloudapi.com`
- API Version：`2025-05-13`
- 填写 SecretId 和 SecretKey

默认密钥只保存在当前会话；开启“记住密钥”后才持久保存。

## 画布工作流

在画布中添加插件节点“混元3D生成”，将文字节点连接到“文字”，或图片节点连接到“单图”。多张参考图连接到“多视图图片”，按连接顺序对应正面、左侧、右侧、背面（最多四张）。多视图优先于单图，单图优先于文字；图片模式只有 Sketch 会同时使用提示词。

在节点中选择模型、格式等参数，点击画布节点的“运行”。节点会提交任务并轮询完成后输出模型文件 URL、预览图和包含 JobId、格式及文件列表的 JSON，均可继续连接下游节点。图片从 HIOS 本地素材输入时由主程序安全读取，不需要公网地址。

画布节点可读取应用中已选择“记住密钥”的 API 配置；未选择时，可在节点内临时填写密钥（不会写入画布状态）。此画布节点依赖含 `asset-read` 与多输出完成协议的新版 HIOS NEXT 主程序；仅更新插件而不更新旧版主程序，不能正常处理本地图片和三个输出。
