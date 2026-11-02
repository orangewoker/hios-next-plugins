# 实色控件与滑块

历史文件名 glass.css/hios-glass.css 保留以兼容已安装插件。当前为不透明实色材质，按钮/输入框 12px 圆角；仅原有滑块的 7px 轨道及 27×21px 手柄保留。菜单禁止 backdrop-filter，不对整块编辑器使用滤镜；选项明确排除通用按钮规则。

同步：node scripts/sync-plugin-ui.mjs；校验：node scripts/check-plugin-ui.mjs、node --test tests/plugin-glass.test.mjs。宿主更新器修复需 3.9.8。
