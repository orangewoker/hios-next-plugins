# HIOS Plugin UI v1

本体负责节点外壳、标题栏、端口与选中态；插件负责 iframe 内部内容。不得向第三方插件强制注入通用样式。

新插件以 template.html 为布局起点，并接入原有 node/app bridge（模板不实现业务桥）。普通表单使用 hios-panel、hios-control、hios-primary。标准：20px 面板圆角、12px 控件圆角、36px 控件高度、14px 间距、20px 内边距、轻量按钮高光和投影。图像、SVG、画布、定位手柄、色板、编辑器几何不参与表单样式。

宿主 init/theme 保留 mode、tokens，并新增 design.version=1 与数值尺寸；旧宿主使用本地默认值。SDK 被动监听父窗口消息，绑定初始化来源与实例，校验颜色和尺寸，不发送 ready，不改变业务状态。

接入步骤：在 adapters.json 登记插件及明确控件选择器；执行 node scripts/sync-plugin-ui.mjs；将 shared/ 三个文件及 HTML 一起发布。重建编译型插件后必须执行同步，桌面前端构建已自动执行；条形码和导演台也有 postbuild。发布前执行同步与 scripts/test-plugin-ui.cjs。不要直接编辑 shared 生成副本。

未来内置普通节点继续走 canvas-node-surfaces.css 的 is-soft-surface 标准，特殊媒体/页面节点只适配外壳，避免缩放坐标被表单布局影响。
