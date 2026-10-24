# 条形码工作室 · HIOS Next

独立 HIOS 应用插件，不是 Codex 插件，也不是内置应用。安装同一个插件即可同时获得应用入口与画布节点，无需重新打包 HIOS。

安装地址：https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/barcode-studio

## 使用
- 插件管理中从 GitHub 地址安装并启用，或选择本地本目录（包含 plugin.json）。
- **应用 → 条形码工作室**：选择 EAN-13、UPC-A、Code 128B、Code 39、二维码，编辑内容与外观。
- **画布 → 添加插件节点 → 条形码工作室**：可连接上游文本到“编码内容”，运行后从“条码图片”端口输出 PNG。未连接文本时使用手动输入。
- 节点中的“输出到画布”会额外创建图片节点；宿主运行仅更新端口，不反复新增节点。
- SVG/PDF/PNG 按钮在 HIOS 内通过 file-store 保存到素材库，不依赖 iframe 下载权限；独立浏览器中改为文件下载。
- 参数随画布节点或应用分别保存。应用导出图片由宿主 onOutput 处理；在应用页不承诺定位到某个未打开的画布。

## 构建
Node.js 22.12+，在 source 目录运行 `npm ci`、`npm run typecheck`、`npm run build`。输出至 ../runtime；发布必须包含 runtime 全部文件，安装无需 Node、npm 或联网依赖。`node --test tests/host.test.mjs` 在安装构建依赖后运行桥接测试。

## 协议
同一 renderer 根据实际父窗口首次 init 选择 hios-plugin-node/v1 或 hios-plugin-app/v1，随后锁定来源、协议与实例。支持 ready/init/theme/state/run/output/error/file-store。仅声明 canvas、filesystem；不使用 process/network，不接收 DXOS 桥接或存储凭据。

## 来源与边界
基于本机 DXOS barcode 1.0.7 发布产物的 Vue/TypeScript 重构版适配，非原作者源码。保留原编码和 SVG/PDF 实现，新增 HIOS 桥接、输入输出、尺寸上限和窄窗口布局；QR 默认静区修正为 4。
EAN/UPC 原实现会过滤非数字，完整位数输入没有严格校验校验码；二维码保留原版 UTF-8、版本 1–10、L 纠错实现。扫码兼容性与正式印刷质量未认证，PDF 尺寸不是毫米。
详见 LICENSE 与 THIRD_PARTY_NOTICES.md：本目录不继承仓库根目录 MIT 对第三方代码的授权推定。

## 验证
通过 TypeScript 类型检查、Vite 生产构建。浏览器沙箱协议夹具验证五种预览、文本输入 run 输出 PNG、状态重载、三种文件保存应答、失败反馈与空输入。夹具不等同于桌面全流程或实体扫描器验证。
