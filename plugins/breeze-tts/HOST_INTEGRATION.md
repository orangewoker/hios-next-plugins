# HIOS 接入说明 · v0.2.0

## 已接线

| 层 | 实现 |
| --- | --- |
| main / sidecar | `electron/services/breeze-workshop.ts`，`hios:breeze:request` IPC |
| preload 共用桥 | `src/shared/hios-bridge.ts` 的 `breezeWorkshop.request` |
| 应用容器 | `plugin-app-host.tsx` 的 `breeze-request` / `breeze-result` |
| 画布容器 | `plugin-node-host.tsx`，四端口 output-batch、runId、25 分钟超时 |
| 隐藏工作流 | `application-workflows.ts`，独立转发宿主 RPC，不依赖可见应用 |
| 任务生命周期 | `breeze-frame-bridge.ts`，超时/卸载/iframe 关闭后取消已接收或迟到的任务 |
| 插件客户端 | `shared/client.js` 自动识别 `features.breezeWorkshop`；旧宿主保留 HTTP fallback |

## 服务托管

只允许已安装、启用并有 `process`、`filesystem`、`network` 权限的 `breeze-tts` 使用接口。服务入口经 PluginStore 的真实路径校验，不接受 iframe 提供任意可执行文件或参数。

复用当前宿主可执行文件，Electron 使用 `ELECTRON_RUN_AS_NODE`，Tauri 使用自带 Node sidecar。通过子进程 IPC 握手交换动态管理凭据；不打印密钥，不开放原生引擎端口。独立启动不需要该握手。

本机模式仅按需启动一个工坊，关闭面板保留；禁用/卸载/覆盖安装/更新时停止，退出或宿主 IPC 断开时服务关闭并停止引擎。端口冲突报错；不偷偷连接非托管进程。

设置中的端口和 LAN 开关由宿主保存并触发受控重启。默认 loopback；远程模式禁止启动本机服务、下载模型和调用 `/api/admin/*`。

## 连接与音频

连接按账号散列路径保存，密钥由 Electron safeStorage / Tauri 平台安全存储加密；Windows DPAPI，macOS 平台实现。系统加密不可用时拒绝保存密钥，没有明文回退。`config` 只为受信插件提供运行时配置，state 与工作流不持久化这些字段。

`import-audio` 接收 jobId。宿主从当前服务下载 WAV、验证格式与大小（512 MiB），使用 LocalDataStore 导入为 `audio`，返回 `hios-asset:`；RPC 开始时捕获当前账号，不能把服务器磁盘路径当成本机资源。renderer 刷新素材缓存；WebView2 播放时映射 `hios-asset.localhost`，输出仍使用 canonical URL。

## 宿主操作

- `config`、`save-config`：共享连接与服务设置。
- `test-connection`：检测指定连接的工坊协议。
- `connection-info`：读取实际地址和连接密钥。
- `copy-connection-key`：由 renderer 的 BreezeFrameBridge 处理，在 HIOS 顶层页面复制实际连接密钥，只返回 `{ copied: true }`；不依赖跨源 iframe 的 Clipboard API 权限。失败时插件显示可选中的手动复制字段。
- `request`：白名单 JSON API（health、voices、jobs、本机 admin）。
- `import-audio`：导入已完成任务。

管理令牌不通过普通 bootstrap 授予任意 HIOS Origin。托管请求由宿主代理并附令牌；独立网页仍仅允许 loopback 同源管理。

## 验证边界

TypeScript、Tauri 前端/sidecar 构建、真实 sidecar 安装和资源链路、浏览器托管协议测试已覆盖，详见 TEST_REPORT。仍需真实模型、另一台物理电脑、防火墙与最终打包 WebView2/Electron 窗口的完整用户流程验收；当前不宣称硬件性能或真人声音质通过。
