# 混元3D

HIOS NEXT 独立应用插件，支持腾讯混元生3D OpenAI 兼容接口和腾讯云 API 3.0。

## 功能

- 文生3D、单图生3D和多视图生3D
- 3.0 / 3.1 模型、PBR、面数、LowPoly / Geometry / Sketch
- 任务状态轮询与本地历史
- GLB / GLTF / OBJ / FBX / STL 三维预览
- 线框、网格、坐标轴、灯光与材质调节
- 模型和预览图下载

## 安装

在 HIOS NEXT 的插件管理页中使用 GitHub 地址安装：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/hunyuan-3d
```

HIOS NEXT 需要支持插件应用 `network-request` 协议（HIOS NEXT 2.1.9+）。

## API 配置

### OpenAI 兼容模式

- Base URL：`https://api.ai3d.cloud.tencent.com`
- API Key：在腾讯混元生3D控制台创建

### 腾讯云 API 3.0

- Endpoint：`https://ai3d.tencentcloudapi.com`
- API Version：`2025-05-13`
- 填写 SecretId 和 SecretKey

默认密钥只保存在当前会话；开启“记住密钥”后才持久保存。
