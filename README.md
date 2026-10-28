# HIOS Next Plugins

HIOS Next 官方与社区插件统一仓库。每个插件独立放在 `plugins/<plugin-id>`，无需为新插件重复创建仓库。

## 当前插件

| 插件 | 版本 | 安装 URL |
| --- | --- | --- |
| DX Cut 视频剪辑（应用 + 画布节点） | 0.2.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/dx-cut`（Windows x64，需 HIOS Next ≥ 3.6.2；设置中可选择 Gitee 国内渠道） |
| 条形码工作室（应用 + 画布节点） | 0.1.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/barcode-studio` |
| 3D 导演台 | 0.1.3 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/director3d`（DSH 与完整功能需要包含导演台 DSH 桥接的新版 HIOS） |
| PhotoCraft 图像编辑器 | 0.5.2 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/photocraft`（需支持 `file-store` 和 `ai-request` 协议的 HIOS Next 主程序更新） |
| DLSS 5 图片增强 | 0.1.2 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/dlss5-image`（需 HIOS Next 桌面版 ≥ 2.6.3） |
| 图片对比 | 0.3.6 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/image-compare` |
| 拼图 | 0.2.3 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/puzzle-grid` |
| AI 提示词库 | 0.1.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/ai-prompt-library` |
| K2 人像提示词生成器 | 0.2.5 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/k2-prompt-generator` |
| 算力云 | 0.2.2 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/compute-cloud` |
| 混元3D | 0.2.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/hunyuan-3d` |
| 水印大师 | 0.1.5 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/watermark-master` |
| 浏览器 | 0.3.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/web-browser`（图片解析修复需配合包含该修复的 Tauri 开发版） |

在 HIOS Next 的“插件管理 → 安装插件”中粘贴对应 URL。安装后插件默认激活；插件管理保留仓库来源，可从同一地址检查更新。

## 目录规则

```text
plugins/
  my-plugin/
    plugin.json       # 必需
    README.md         # 推荐
    package.json      # 可选，Node 运行时
    requirements.txt  # 可选，Python 运行时
```

开发新插件、清单字段、权限和版本规则见 [DEVELOPMENT.md](./DEVELOPMENT.md)。

## 安全约定

- API Key、Cookie、登录态和代理凭据不得提交到仓库。
- 凭据由 HIOS 设置界面写入本机加密存储。
- 插件只声明实际需要的权限。

## 许可证

仓库中的清单与示例文档使用 MIT License。第三方站点内容及服务遵循各自条款。

## 主题

| 主题 | 版本 | 安装 URL |
| --- | --- | --- |
| 条形码工作室（应用 + 画布节点） | 0.1.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/barcode-studio` |
| 夏日晴空 | 1.0.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/themes/summer-breeze` |
| iOS 26 Liquid Glass | 1.0.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/themes/ios26-liquid-glass` |

## 第三方来源许可

`plugins/barcode-studio` 含由 DXOS barcode 发布代码重构的部分，适用其目录内 LICENSE 和 THIRD_PARTY_NOTICES.md；不将仓库根 MIT 许可自动扩展至该第三方来源代码。

