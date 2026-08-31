# 图片对比

在无限画布中连接图片 A 与图片 B，直接在独立插件节点内拖动分割线比较两张图片，并可输出当前遮罩对比图。

## 0.3.0

- 已移除宿主 `builtin` 适配器，界面、逻辑和输出全部位于插件自己的 `runtime/index.html`。
- 两张图片固定尺寸完整叠放；滑杆只通过 `clip-path` 改变 A 图可见范围，不改变两图尺寸。
- 支持主题同步、滑杆状态持久化、画布 `run` 协议和 PNG 图片输出端口。
- 安装或更新后由 HIOS 动态刷新 renderer，无需为本插件再次修改或重打包主程序。

安装 URL：`https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/image-compare`
