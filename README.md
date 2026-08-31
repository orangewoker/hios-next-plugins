# HIOS Next Plugins

HIOS Next 官方与社区插件统一仓库。每个插件独立放在 `plugins/<plugin-id>`，无需为新插件重复创建仓库。

## 当前插件

| 插件 | 版本 | 安装 URL |
| --- | --- | --- |
| Civitai 素材库 | 0.2.0 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/civitai-assets` |
| 小红书素材库 | 0.2.0 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/xiaohongshu-assets` |
| Pinterest 素材库 | 0.1.2 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pinterest-assets` |
| 图片对比 | 0.3.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/image-compare` |
| AI 提示词库 | 0.1.0 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/ai-prompt-library` |
| 静态网页 | 0.1.0 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/static-site-runner` |
| PDF / DWG 图纸查看器 | 0.1.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/pdf-dwg-viewer` |

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
| 夏日晴空 | 1.0.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/themes/summer-breeze` |
| iOS 26 Liquid Glass | 1.0.1 | `https://github.com/orangewoker/hios-next-plugins/tree/main/themes/ios26-liquid-glass` |
