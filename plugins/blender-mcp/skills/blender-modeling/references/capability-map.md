# 能力路由

先判断任务类型，再选择最小模块集合：

| 任务 | 首选模块 | 必做验收 |
| --- | --- | --- |
| 新建物体/产品 | `blockout`、`hard-surface` | 比例、轮廓、倒角、预览 |
| 家具/建筑 | `blockout`、`hard-surface` | 单位、连接关系、尺寸 |
| 修改已有模型 | `repair` | 场景保护、变换、重复物体 |
| 材质/灯光 | `materials`（按需创建） | 渲染预览、材质槽 |
| 参考图重建 | `blockout`、`repair` | 视角假设、多视图对照 |
| 导出交付 | `export-contract` | 文件存在、可重新导入 |

所有任务都必须经过：`inspect_scene → checkpoint_scene → blockout → render_preview → refine → export_model`。简单修改可以跳过不适用模块，但不能跳过场景检查和最终验收。
