# 效果控制器

HIOS Next 独立画布节点插件。本地组合场景、业态、预设与控制项，输出分段结构化中文提示词。**不接收图片，不调用模型，不执行 ComfyUI。**

## 安装与连接

1. 在 HIOS 插件管理中选择本地目录安装，选择本目录（直接包含 `plugin.json`）。
2. 启用插件，在画布添加「效果控制器」节点。
3. 将「提示词」输出连接至生图节点的文本/提示词输入。
4. 原始图片单独直接连接至生图节点。选择模型和运行生成均在原有生图节点完成。

```text
效果控制器 ── 提示词 ──→ 生图节点 → 结果图
原始图片   ── 图片 ────→ ↑
```

在线安装：在 HIOS 插件库刷新官方来源，搜索「效果控制器」；也可在安装插件中粘贴 `https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/effect-controller`。

分发整个目录即可安装；通过 ZIP 分享时先解压再选择目录。发布包已包含运行文件，无需 npm install。已按 HIOS Next 3.6.6 的插件协议与 UI v1 SDK 验证，不需要为本插件重新打包主程序。

## 使用

- 选择「模型出图」或「效果提升」，再选择场景分类和具体业态。
- 应用当前场景的预设，勾选需要的控制项；关闭项不会进入提示词。
- 每项支持自定义要求。更多项按场景筛选，不将室内、建筑和景观参数混杂展示。
- 在补充要求中填写个性化描述；展开提示词预览检查实际输出。
- 编辑后自动更新提示词输出，**不会自动运行下游生图节点**。下游运行请求会重新编译最新状态。
- 预设、草稿与收藏随节点状态保存；支持个人预设导入导出。
- 结构保持、文字保留等是文本编辑指令，不是实际几何锁定或模型参数。是否遵循由所选图像模型决定。

默认只提供一个文本输出口；限制要求合并在主提示词中，不需要额外接负面提示词，也避免不支持负面输入的模型丢失约束。

## 主题与权限

仅声明 `canvas` 权限，无网络、进程、模型或文件系统权限。使用 HIOS Plugin UI SDK 跟随浅色、深色和自定义主题；主题切换不修改业务数据。外观默认值来自 SDK，插件不维护独立皮肤。

`plugin.json` 中插件 ID、节点 ID 和输出端口 `prompt` 保持稳定，更新时保留已有画布连接。插件代码与共享 UI 文件必须一同发布。

## 开发验证

在 HIOS 仓库根目录执行：

```text
node scripts/sync-plugin-ui.mjs
node --test tests/effect-controller-core.test.mjs tests/effect-controller-package.test.mjs
node scripts/check-plugin-ui.mjs
node scripts/test-plugin-ui-sdk.mjs
node_modules/.bin/electron tests/effect-controller-ui.cjs
node scripts/package-effect-controller.mjs
```

安装与 UI 测试使用隔离配置，不修改用户插件、画布或模型配置。发布命令生成 `output` 下的独立目录，不重新打包 HIOS 主程序。
