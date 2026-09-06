---
name: blender-hard-surface
description: 用可重试的 Blender Python 创建或细化硬表面、家具和产品模型。
---

# 硬表面

优先使用数据 API 或 `bmesh`，明确设置活动对象后再使用 `bpy.ops`。稳定命名、合理倒角和法线是最低要求；每次改动后检查尺寸、修改器和意外重复对象。
