# Blender MCP 建模

版本：`0.2.0`

HIOS 的 Blender 建模 Skill + MCP 插件。它采用“场景检查 → 检查点 → 粗模 → 截图验收 → 细化 → 最终渲染 → 可移植格式导出”的工作流，用于安全地创建、修改和交付 3D 模型。

## 能力

- `status`：检查 Blender 与工作区配置。
- `inspect_scene`：检查已有 `.blend` 中的对象、材质、尺寸和位置。
- `checkpoint_scene`：修改前保存版本化检查点。
- `execute_script`：执行小段、可重试的 Blender Python，保存 `.blend` 并可生成预览。
- `render_preview`：渲染预览图，供视觉验收。
- `export_model`：导出 `GLB`、`FBX`、`OBJ` 或 `STL`；未指定格式时优先 `GLB`。

## 配置

默认 Blender 路径：`D:\sf\blender-5.1.1\blender.exe`

可用环境变量覆盖：

```text
HIOS_BLENDER_EXECUTABLE=D:\path\to\blender.exe
HIOS_BLENDER_WORKSPACE=D:\your\blender-workspace
```

所有输出都会限制在 `HIOS_BLENDER_WORKSPACE` 内。完整建模流程见 `skills/blender-modeling/SKILL.md`。
