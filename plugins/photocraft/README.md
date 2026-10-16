# PhotoCraft for HIOS Next

可选安装的 PhotoCraft Rust/WASM 编辑器插件，不内置、不随 HIOS 安装包分发，不依赖远程网站、外部 exe 或界面截图。上游：[orangewoker/photocraft](https://github.com/orangewoker/photocraft)，固定版本 `2a952f164c0b4cf936b1c6497db10dd095341c00`。

## 安装与卸载

在 HIOS Next 的“插件管理”刷新官方插件列表，选择安装 PhotoCraft；或通过 GitHub 安装 URL：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/photocraft
```

安装后才会在应用列表与画布节点菜单出现。可在插件管理停用、启用、检查更新或卸载。约 41 MB 的 WASM 和字体只保存在插件安装目录，不增加 HIOS 安装包体积。需要包含 `file-store` 和 `ai-request` 协议的 HIOS Next 主程序更新；旧版宿主若不支持该协议，无法保存文档或完成画布输出。

## 使用

- **应用**：在应用列表打开 PhotoCraft，打开本机图片/PSD/PhotoCraft 文档，使用原生的图层、蒙版、绘画、调整和滤镜界面；顶部“导出”下载当前文档。
- **画布**：添加“PhotoCraft 编辑器”节点，窗口式界面可调整大小、全屏编辑。连接多张图片到“图片 / 文档”输入，每张图片在同一个文档中占一个独立像素图层，不替换前面导入的图或已有编辑。首图决定画布尺寸，后续图片居中放置，超出画布时等比缩小；导入可撤销。重复初始化、重复运行和重载不会重复添加相同输入，断开连线不会删除已导入图层。节点顶部“打开”选择普通图片时同样追加图层；PSD/PhotoCraft 等分层项目仍按文档打开。
- **输出**：点击节点“运行”即导出当前文档所有可见图层的合成 PNG，在画布上新增并连接一个结果图片节点，同时更新图片端口；顶部“输出到画布”也可选择其他格式。PNG/JPEG/WebP 为图片输出，PSD/PhotoCraft 为保留图层的文件输出。
- **保存**：停止编辑约 1.8 秒后自动将当前文档保存成 HIOS 磁盘素材中的 `.pcraft`，保留图层。顶部“保存文档”可立即保存；重新打开会恢复最近保存的活动文档。
- `.psd`、`.psb`、`.pcraft` 文件关联到该节点，不更改 PNG/JPG 的默认图片节点。
- 界面默认简体中文，附带可离线使用的 Noto Sans SC 字体，避免 Web 版中文显示为方框；仍可在 PhotoCraft 偏好设置切换语言。

### AI 工具栏与本地分层（0.4.0）

需要 HIOS Next **3.0.1+**。不再要求 chatgpt2api-h、PSD v2 或其他专用服务；只需要支持视觉理解和参考图编辑的普通 AI 路由。

- 工具栏选择分析路由和视觉模型；在“更多”中分别选择 **分层图片路由/图片模型**（需绑定 image.edit 能力）。模型不能处理图片时会明确报错，不会自动改用其他模型。
- 选择范围：选区、当前图层或整个画布；默认三层为背景、文字、主体，层数可选 2–30。
- 分析模型返回拆分计划；图片编辑模型补全背景并为非背景对象生成黑白分割蒙版。前景使用原图像素乘以蒙版，以保留原图细节；无文字时输出空文字层，不虚构文字。
- 插件通过离线 ag-psd 在本机组装 PSD，再交给真实 PhotoCraft 引擎导入图层组。保留原图层、范围坐标与捕获选区蒙版；不下载 ZIP，不把模型代码作为脚本执行。
- 每次分析一次，随后每个非空层一次图片编辑调用，可能分别计费。最长30分钟；窗口重载恢复查询，不重复提交。宿主进程重启会将未完成的本地分层标记中断，不自动重新收费；已完成素材保存在本地资源库。
- 局部改图、图生图、文生图仍通过原 HIOS 图片路由生成并新增图层。
- 结果宽高比错误、缺少有效黑白蒙版时不自动导入；可更换模型重试。模型分割与背景补全不保证精确，建议检查边缘和重叠。文字为像素层，不保证可编辑文字。
- 本地分层最多1200万总图层像素（宽×高×层数），PSD文件上限64MiB。2048×2048三层可用；大图请缩小范围或减少层数。
- PSD完成后可从“结果”下载或作为新文档打开。AI凭据仅保存在HIOS宿主，插件只获得名称和本地素材地址。

`backend/` 是0.3.x旧版专用服务的历史补丁，**0.4.0新分层流程不需要它**。宿主仅为已经提交的旧任务保留兼容查询路径。

### 当前边界

- 自动恢复只保存**当前活动文档**，不恢复其他未激活标签页；多个重要文档请分别导出备份。关闭应用/切换页面前，请等待底部“可编辑文档已保存到 HIOS”或点击“保存文档”。
- HIOS 桥接导入、快照和导出单文件上限为 **64 MiB**；超出时可尝试 PhotoCraft 自带的 File 菜单本机导出。浏览器的可用内存仍决定大文档处理能力。
- 使用浏览器的 WebGPU/WebGL2，不是把桌面 exe 嵌入窗口。若默认 GPU 启动失败，可用“使用 WebGL 模式重试”。
- PSD/PSB 的兼容性、滤镜和文件格式能力由固定版本的 PhotoCraft 提供，并非 Photoshop 全功能等价。部分系统字体、桌面打印/插件等平台能力在 Web 版中不同。
- 应用与每个画布节点是独立编辑会话；窗口式节点不是额外的操作系统窗口。

## 构建运行时

插件仓库包含已构建的 `web/photocraft-web.js` 和 `web/photocraft-web_bg.wasm`，用户安装不需要 Rust。HIOS 的前端、Electron 和 Tauri 发布构建都不构建、不检查、不携带 PhotoCraft 运行资源。

重新构建需要 Git、Rust 1.95+、`wasm32-unknown-unknown` 和 Trunk 0.21.14：

```powershell
rustup target add wasm32-unknown-unknown
cargo install trunk --version 0.21.14 --locked
node scripts/build-photocraft-plugin.mjs
node scripts/check-photocraft-runtime.mjs
```

脚本默认克隆固定上游版本到 `tmp/photocraft-source`。已有同版本源码时可设置 `PHOTOCRAFT_ROOT`。脚本临时注入 `scripts/photocraft/hios.rs`，构建后恢复上游源码和 Cargo.lock，再原子替换插件运行资源。它会检查源码 HEAD，记录版本、构建时间及 WASM SHA-256；不使用未适配的上游构建替代。

适配器在每帧处理导入、真实文档导出、快照、保存确认与主题同步；不修改 PhotoCraft 编辑引擎。文件写入必须得到宿主成功确认后，才标记该快照版本已保存。JSON 状态只记录素材地址和输入指纹，不存储文档二进制或图片 base64。

## 验证

```powershell
node --test tests/photocraft-plugin.test.mjs tests/plugin-ai-service.test.mjs
python tests/photocraft-psd-backend.test.py
node scripts/check-photocraft-runtime.mjs
npm run typecheck
node tests/fixtures/photocraft-host.mjs
.\node_modules\.bin\electron.cmd tests/photocraft-ui-regression.cjs
```

上述宿主集成测试位于 HIOS Next 开发工作区。`photocraft-host.mjs` 启动隔离的真实 WASM 协议测试页：`http://127.0.0.1:4387/` 测试节点，`/?surface=app` 测试应用。Electron 回归测试实际安装本地插件，验证两图两层、透明合成、重复运行与恢复、停用和卸载，并使用真正的应用/节点宿主、插件资源解析和 HIOS 磁盘存储。两者只写 `output/playwright/`，不接触用户 HIOS 数据。

## 许可

HIOS 适配文件：`LICENSE`（MIT）。PhotoCraft：`LICENSE-MIT` 或 `LICENSE-APACHE`，另保留 `NOTICE`、`ATTRIBUTION.md`。WASM 内嵌的字体、图标、词典和主题许可文本位于 `THIRD_PARTY/`（保留上游目录结构）。`fonts/NotoSansSC-Regular.ttf` 是 HIOS 现有 Noto Sans SC 可变字体的 Regular 实例（`python scripts/photocraft/prepare-font.py <NotoSansSC-Variable.woff2>` 可重建），许可为 `fonts/OFL-NotoSansSC.txt`。HIOS 入口图标为独立绘制，不使用受限的 ArtCraft 品牌资料。

本地 PSD 组装依赖 ag-psd 31.0.2，浏览器 bundle 仅随可选插件分发。可在 HIOS 开发工作区运行 `node scripts/build-photocraft-psd.mjs` 重建。第三方许可保存在 vendor/THIRD-PARTY-LICENSES.txt。
