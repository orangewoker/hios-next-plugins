---
name: blender-modeling
description: Create and refine validated Blender models from text, reference images, existing assets, or technical drawings. Use this skill whenever a task needs Blender geometry, materials, scene editing, preview validation, or portable 3D export.
license: MIT
allowed-tools: [mcp:blender-mcp.server:*]
metadata:
  hios:
    version: "0.2.0"
    surfaces: [agent]
    intent: blender
    execution-mode: tool-required
    requires-mcp: [blender-mcp.server]
---

# Blender 建模工作流

这是一个编排器，不是单次脚本模板。根据任务读取 `references/capability-map.md`，只加载需要的模块，然后通过 MCP 工具完成可验证的 Blender 任务。

## 强制流程

1. **确定目标**：识别输入类型、尺寸/单位、坐标轴、输出格式、是否必须保留现有场景。
2. **先检查再修改**：调用 `status` 和 `inspect_scene`；把现有对象、集合、材质、相机、灯光视为用户资产。
3. **建立检查点**：大范围修改前调用 `checkpoint_scene`，不要覆盖用户原始 `.blend`。
4. **粗模优先**：用小段、可重试、幂等的 `execute_script` 建立轮廓、比例、连接关系；随后调用 `render_preview` 并实际查看截图。
5. **逐步细化**：只修复当前最大问题，分块执行脚本；每一阶段检查对象命名、变换、尺寸、拓扑、修改器和重复物体。
6. **最终验收**：再次渲染并检查视觉结果；不能把“脚本执行成功”当成视觉验收。
7. **交付导出**：用户未指定格式时，调用 `export_model` 导出 `.glb`，同时保存版本化 `.blend` 和预览图；所有路径必须是绝对路径且位于工作区内。

## 场景安全

- 不得清空场景、删除默认对象、重置世界或替换相机，除非用户明确要求且检查确认是启动内容。
- 新建对象使用 `GEO-`、`MAT-`、`LGT-`、`CAM-`、`COL-` 等前缀，并优先放入任务集合。
- 每次 Blender 执行都是独立 Python 命名空间；通过稳定名称重新获取对象。
- 发生超时或错误时只重试失败阶段，不要盲目重放完整构建脚本。

## 输入与模块

文字、单图、多视图、线稿、尺寸图、纹理包和现有 `.blend` 都可以作为输入。读取 `references/capability-map.md` 后，再按需加载 `modules/` 下的领域模块；不要预先加载全部模块。

## 交付标准

最终回复必须列出：创建/修改对象、关键尺寸、验证方式、限制，以及 `Artifacts` 部分。模型导出文件排在前面，`.blend` 源文件和预览图随后；每个路径只列一次。
