# iOS 26 Liquid Glass

面向 HIOS Next 的深色高通透液态玻璃主题。设计参考 iOS 26 控制中心：让彩色背景真实穿透控件，使用蓝紫玻璃染色、连续圆角、折射高光和柔和动态反馈形成清晰景深。

## 安装

在 **设置 → 主题 → 安装主题 → GitHub 仓库 URL** 中填写：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/themes/ios26-liquid-glass
```

安装完成后主题会立即启用，并支持在线更新。

## 设计细节

- 内容层与导航层分离，彩色背景会透过玻璃窗格与卡片；
- 玻璃材质包含高饱和背景取样、蓝紫染色、镜面边缘和柔和投影；
- 浮动 Dock、按钮、输入板块和弹窗采用连续圆角；
- 重复卡片避免逐层模糊，降低 GPU 与内存压力；
- 支持减少动态效果和不支持 `backdrop-filter` 的降级显示。

参考 Apple 的 [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) 与 [Adopting Liquid Glass](https://developer.apple.com/documentation/TechnologyOverviews/adopting-liquid-glass) 设计原则。
