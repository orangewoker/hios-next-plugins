# 插件液态玻璃材质

以 `color-grade` v0.3.1 已确认的控件为标准。只统一材质，不统一插件业务布局。

## 接入

1. 在 `adapters.json` 注册原有 `controls`，并配置 `glass` 的显式选择器：
   - `buttons` / `fields`：补充普通按钮与文本框。`controls` 中对应元素自动包含。
   - `ranges`：原生设置滑块；不要包含图片对比分界、裁剪或定位手柄。
   - `switches`：原生设置 checkbox；素材选择、同意条款、radio 不改为开关。
   - `panels` / `bars` / `menus` / `options`：卡片、导航条、浮层与选项。
   - `primary`：原业务主操作，使用宿主 accentContrast，避免浅色强调色下文字消失。
2. 执行 `node scripts/sync-plugin-ui.mjs`。可传入额外插件根目录。
3. 执行 `npm run check:plugin-ui`。

SDK 生成 `shared/hios-glass.css` 并复制 `hios-glass.js`。不直接改构建产物，插件重新构建后再次运行同步即可。共享主题消费者原有来源、实例和 token 校验保持不变。`color-grade` 用 `glass.local` 保留已确认的本地材质层，同步器保证其始终位于 SDK 后。

## 行为与性能

- 胶囊按钮、7px 轨道、27×21px 手柄、32×20px 原生设置开关、20px 卡片、18px 磨砂浮层。
- 不修改 value、checked、业务事件、宿主协议、图片像素、画布坐标、时间轴和 3D gizmo。
- `hios-glass.js` 仅同步 `--range-fill`：输入即时更新；动态 DOM 增量注册；仅对可见范围每 160ms 检查属性赋值，覆盖预设/撤销/重置。后台暂停；无滑块不创建计时器；不改原生/React value setter。
- 模糊仅限导航条和浮层，不给整个编辑器、文字或图片设置 filter。支持 reduced-motion、forced-colors 与无 backdrop-filter 降级。
- Element Plus 水平/垂直 slider 和 switch 单独适配，不改变定位包裹层；条码原有自定义 switch 只改变 track/knob 材质。
- PhotoCraft 的 HTML 工具栏/菜单接入；其 WASM 内部绘制控件保留原引擎。浏览器网页内容不覆盖；真实浏览器的宿主导航在 `src/renderer/native-browser-node.css` 单独接入。

## 验证

先运行 `node scripts/preview-plugin-glass.mjs`，再运行 `node node_modules/electron/cli.js tests/plugin-glass-ui.cjs`。
预览读取本仓及可选的同级 `hios-next-plugins/plugins`，不调用生成服务。真实 Chromium 测试输出位于 `output/plugin-glass/`，覆盖每个入口的浅色、深色、绿色和窄面板。模型、联网及导出业务需要实际 HIOS 环境验证，不由 UI smoke 代替。

`npm run sync:plugin-ui:dev` 仅向工作区 `ls/plugins` 叠加界面文件；先备份 HTML/SDK 文件到 `.codex-temp`，不改插件注册表、不重装业务代码、不降级版本。该命令不会发布市场版本。
