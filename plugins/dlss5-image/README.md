# DLSS 5 图片增强

需要 HIOS Next 桌面版 **2.6.1 或更新版本**。在“插件管理”中安装 `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/dlss5-image`，以后可在插件管理中在线更新。

HIOS 图片增强应用和画布节点共用本地图片处理链。需自行安装 [Visual Enhancer](https://github.com/Merserk/dlss5-visual-enhancer)，在应用中选择 `VE_CLI.exe`。运行库不随 HIOS 分发。

目前仅支持 Windows、NVIDIA GPU 和 PNG/JPG/WEBP 输入；输出保存为 HIOS 本地 PNG 素材。画布节点只接受已连接的 HIOS 本地素材或图片 data URL。失败时返回运行库原始错误，不静默回退到其他增强器。

这是实验性图片增强工作流，并不等同于游戏内 NVIDIA DLSS 5 的 3D 引导渲染。默认采用 CLI 自身的保守设置，不开启高倍放大。视频支持留待后续版本。
