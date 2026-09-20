# 混元3D

HIOS NEXT 独立应用插件，支持腾讯混元生3D OpenAI 兼容接口和腾讯云 API 3.0。

## 功能

- 文生3D、单图生3D和多视图生3D
- 3.0 / 3.1 模型、PBR、面数、LowPoly / Geometry / Sketch
- 任务状态轮询与本地历史
- GLB / GLTF / OBJ / FBX / STL 三维预览，支持 ZIP 模型包中的纹理资源
- 线框、网格、坐标轴、灯光与材质调节
- 模型下载与本地缓存（优先使用缓存，避免任务链接到期后无法下载）

## 安装

在 HIOS NEXT 的插件管理页中使用 GitHub 地址安装：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/hunyuan-3d
```

HIOS NEXT 需要包含插件应用 `network-request` 协议的主程序。目前该支持已提交到 HIOS NEXT 的 `Tauri` 分支；旧版主程序无法通过插件单独补齐此能力。

安装后从应用页打开“混元3D”，在右上角“API 设置”中填写自己的密钥。OpenAI 兼容接口仅支持专业版；腾讯云 API 3.0 支持专业版和极速版。此插件不附带 API Key，生成费用由所配置的账号承担。

## API 配置

### OpenAI 兼容模式

- Base URL：`https://api.ai3d.cloud.tencent.com`
- API Key：在腾讯混元生3D控制台创建

### 腾讯云 API 3.0

- Endpoint：`https://ai3d.tencentcloudapi.com`
- API Version：`2025-05-13`
- 填写 SecretId 和 SecretKey

默认密钥只保存在当前会话；开启“记住密钥”后才持久保存。
