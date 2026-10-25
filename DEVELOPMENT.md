# HIOS Next 插件开发规范

## Skill + MCP 插件（schemaVersion 2）

插件可以独立贡献标准 `SKILL.md` 和 MCP Server，更新插件即可更新能力，不需要修改或重新打包 HIOS 主程序：

```json
{
  "schemaVersion": 2,
  "id": "my-agent-plugin",
  "name": "My Agent Plugin",
  "version": "0.1.0",
  "permissions": ["agent", "process"],
  "contributes": {
    "skills": [
      { "id": "my-skill", "path": "skills/my-skill/SKILL.md", "enabledByDefault": true }
    ],
    "mcpServers": [
      { "id": "server", "name": "My MCP", "transport": "stdio", "entry": "mcp/server.mjs", "runtime": "node", "enabledByDefault": true }
    ]
  }
}
```

- Skill 目录名必须与 `SKILL.md` frontmatter 的 `name` 一致。
- STDIO MCP 需要 `process` 权限；HTTP MCP 需要 `network` 权限。
- `entry` 只能指向插件目录内的 `.js`、`.mjs`、`.cjs` 或 `.py` 文件。
- Node MCP 可声明 `"install": { "npm": true }` 并提交 `package-lock.json`，不要提交 `node_modules`。
- API Key、Token、Cookie、Authorization 等 Secret 不得写入清单；由 HIOS MCP 设置写入系统安全存储。
- MCP Tool 在 Agent 中的唯一 ID 为 `mcp:{pluginId}.{serverId}:{toolName}`。

## 最小清单

每个插件必须包含 `plugin.json`：

```json
{
  "id": "my-plugin",
  "name": "我的插件",
  "version": "0.1.0",
  "description": "插件用途",
  "author": "作者",
  "homepage": "https://github.com/owner/repo/tree/main/plugins/my-plugin",
  "permissions": ["canvas"],
  "contributes": {
    "apps": [
      { "id": "my-app", "title": "我的插件应用", "entry": "app/index.html", "category": "design" }
    ]
  },
  "capabilities": [
    { "id": "my.capability", "title": "我的能力", "description": "能力说明", "settings": true }
  ],
  "nodes": [
    { "id": "my.node", "title": "我的画布节点", "description": "节点说明" }
  ]
}
```

## 字段和权限

- `id`：全仓库唯一，使用小写字母、数字、点、下划线或短横线。
- `version`：遵循 SemVer；发布更新必须递增。
- `capabilities`：安装后注册到能力中心，可声明 `settings: true`。
- `nodes`：安装后注册到无限画布节点菜单。
- `builtin`：仅供 HIOS 主程序内置能力使用，第三方插件不得声明，内置能力也不会出现在插件管理页。
- `rendererEntry`：第三方画布插件的正式入口。界面与业务逻辑应提交到插件目录，主程序只提供稳定协议。
- `contributes.apps[]`：在 HIOS 应用板块贡献完整插件应用。`entry` 必须是插件目录内的 HTML；页面运行在 sandboxed iframe 中，使用 `hios-plugin-app/v1` 的 `ready`、`init`、`state`、`output` 和 `close` 消息。
- 声明 `filesystem` 权限后，renderer 可发送 `request-directory`，用通用目录接口运行本地静态站点。
- 声明 `network` 权限后，renderer 可使用宿主的通用插件浏览器接口。sandbox iframe 内不要直接创建 Electron `<webview>`。

权限：

- `network`：访问网络服务。
- `filesystem`：读取或写入 HIOS 数据目录。
- `canvas`：注册画布能力与节点。
- `agent`：允许 Agent 调用能力。
- `process`：安装或启动插件自带运行时。

插件需要依赖时可声明：

```json
{
  "permissions": ["process"],
  "install": { "npm": true, "python": true }
}
```

仅当目录存在 `package.json` / `requirements.txt` 时才会安装对应依赖。

## 通用插件浏览器接口（Electron 兼容层）

> Tauri/WebView2 版本不提供 Electron `<webview>`。新插件不得把
> `browser-open` / `browser-command` 作为唯一运行路径；读取公开网页应优先使用下方
> `network-request` 协议，再在插件沙箱中生成阅读视图。旧接口仅供 Electron 兼容构建使用。

旧版网页素材类插件可通过 `hios-plugin-node/v1` 消息协议使用 Electron 宿主 WebView：

- `browser-open`：传入 `src`、可选 `userAgent` 和 `{ top, right, bottom, left }` 边距。
- `browser-close`：关闭宿主 WebView。
- `browser-command`：传入唯一 `requestId` 及命令 `load-url`、`back`、`forward`、`reload`、`set-zoom`、`execute-js`、`state`、`set-cookies` 或 `clear-cookies`。
- `browser-result`：宿主按 `requestId` 返回 `result` 或 `error`。
- `browser-event`：宿主推送 `dom-ready`、`did-stop-loading`、`did-fail-load`、`navigation`、`context-menu`。

示例：

```js
parent.postMessage({
  protocol: 'hios-plugin-node/v1', nodeId, pluginId,
  type: 'browser-open',
  payload: {
    src: 'https://example.com/',
    bounds: { top: 70, right: 0, bottom: 0, left: 0 }
  }
}, '*');

parent.postMessage({
  protocol: 'hios-plugin-node/v1', nodeId, pluginId,
  type: 'browser-command',
  payload: { requestId: crypto.randomUUID(), command: 'state' }
}, '*');
```

浏览器会话按 `pluginId` 隔离并持久保存。插件应在 `browser-result` 中匹配 `requestId`，用 `browser-event` 更新导航状态；需要采集网页元素时，可在 `context-menu` 后调用 `execute-js`。用户点击宿主右键菜单“保存原图到画布”时，插件会收到 `{ event: 'context-action', action: 'save-original', params }`。`set-cookies` 接受目标 `url` 与 `name=value; name2=value2` 文本，`clear-cookies` 清空当前插件会话。该协议不依赖具体插件 ID，插件可以独立更新 UI、解析与输出逻辑。

## 通用网络与画布直出

声明 `network` 权限的插件可发送 `network-request`，在 `payload` 中提供唯一 `requestId`、HTTP(S) `url`、可选 `method`、`headers`、`body` 与 `proxy`。宿主通过 `network-result` 返回 `status`、`ok`、`headers`、文本 `body` 或 `error`。请求运行在按插件隔离的 Electron Session 中，适合需要 API Key、代理或规避浏览器 CORS 的素材 API。

图片 `output` 项若带有 `metadata: { addToCanvas: true }`，宿主会保存原图、在插件节点右侧创建图片节点并自动连线。网页素材插件可把右下角批量输出按钮和 `context-action/save-original` 右键动作统一接到这套输出协议。

### 二进制文档保存

支持 `file-store` 协议的 HIOS Next 宿主允许声明 `filesystem` 权限的应用与节点发送 `file-store`：`payload` 为 `{ requestId, key, name, mime, bytes }`。`bytes` 为 `Uint8Array` 或 `ArrayBuffer`，大小为 1 byte–64 MiB；`key` 为 8–80 位字母、数字、`_` 或 `-`，不得提供本机磁盘路径。宿主通过 `file-store-result` 返回 `{ requestId, result: { url, name, size } }` 或 `{ requestId, error }`。

插件仅在成功回复后标记文档已保存。JSON `state` 保存返回的素材 URL，不内嵌文档二进制或大型 base64。快照和图片导出应使用不同的 `key`，避免覆盖快照素材条目。PhotoCraft 是可选的独立插件示例：编辑器、WASM 和字体不随 HIOS 主程序分发。

## 仓库工作流

1. 在 `plugins/<plugin-id>` 新建插件目录。
2. 校验 `plugin.json` 是合法 JSON 且版本已递增。
3. 不提交密钥、Cookie、账号和本机绝对路径。
4. 在本地 HIOS 中通过 GitHub 子目录 URL 安装验证。
5. 验证启用、停用、更新、卸载、深浅主题和重启后的状态。
6. 合并到 `main` 后，用户可通过插件管理的更新按钮获取新版。

提交前运行仓库校验器：

```powershell
node scripts/validate-plugins.mjs
```

校验器会检查清单 ID、SemVer、渲染入口、内联脚本语法，并阻止 Tauri 版网页类插件重新依赖 Electron `<webview>`。

## 兼容性

仓库中的第三方插件均自行携带 `runtime` 界面与业务逻辑，不依赖主程序内的插件 ID 专用适配器。主程序只提供版本化消息协议、画布端口、目录选择和通用浏览器等稳定接口。插件新增页面、解析规则或交互时只需发布新的插件版本；仅在需要一种尚未开放的宿主级能力时，才需要升级 HIOS Next。

## 通用 AI 长任务（应用与节点）

声明 `agent` 权限的已安装、已启用插件可发送 `ai-request`。宿主在 source/origin/pluginId 校验后再由主进程复核真实安装权限；模型凭据不会进入插件。

```js
parent.postMessage({protocol: 'hios-plugin-node/v1', pluginId, nodeId, type: 'ai-request', payload: {
  requestId: crypto.randomUUID(), action: 'catalog'
}}, hostOrigin);
```

应用使用 `hios-plugin-app/v1`。应答为 `ai-result`，payload 含 `requestId`、`result` 或 `error`。

- `catalog`：返回 `choices:[{routeId,routeName,model,modes:['generate','edit','psd']}]`，只列出 AI 路由已启用的能力绑定，不暴露密钥。
- `start`：`clientId` UUID（相同 ID 幂等）、`kind:'image'|'psd'`、`mode:'generate'|'edit'`、`routeId`、`model`、`prompt`、`image`（编辑/分层需要本地 hios-asset 图片 URL）、`layers`（PSD 默认3，2–30）、`size`。立即返回任务 ID 和状态，不等待生成完成。
- `status`：`jobId`，返回 `status:'running'|'success'|'error'|'cancelled'`、`stage`、`elapsedSeconds`、成功时 `output:{url,name}`。
- `cancel`：`jobId`。中止宿主 HTTP/轮询，禁止晚到结果成为可导入结果；PSD 上游没有取消端点时可能继续生成。

任务按账户/插件隔离，每插件同时最多2个，最长30分钟。状态仅存任务元数据和素材引用，不保存 API Key、参考图 base64 或提示词。应将任务 ID 和范围元数据保存在插件 state，再每4秒查询，重载时不重新 start。图片生成复用宿主完整协议中心路由；PSD 使用单独的可编辑文件服务 v2（详见 PhotoCraft 的 backend 文档），只下载同源 PSD，不跟随带凭据重定向。

PhotoCraft 0.4.0 分层使用 `pipeline:local-layers/v1`，由通用视觉和图片编辑模型生成素材清单，在插件本地组装 PSD；要求 HIOS Next 3.0.1+。详见 plugins/photocraft/README.md；不需要部署 PSD 专用后端。

## 节点视觉标准（UI v1）

新插件必须采用 `sdk/plugin-ui` 的共享套件与模板。表单圆角 12px、面板 20px、控件高度 36px、间距 14px；不要对图片/SVG/画布/定位手柄应用通用表单样式。宿主负责外壳，插件负责 iframe 内容。构建后执行 `node scripts/sync-plugin-ui.mjs`，不得只手工修改打包后的 HTML。详见 `sdk/plugin-ui/README.md`。
