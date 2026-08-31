# HIOS Next 插件开发规范

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

## 通用插件浏览器接口

网页素材类插件通过 `hios-plugin-node/v1` 消息协议使用宿主 WebView：

- `browser-open`：传入 `src`、可选 `userAgent` 和 `{ top, right, bottom, left }` 边距。
- `browser-close`：关闭宿主 WebView。
- `browser-command`：传入唯一 `requestId` 及命令 `load-url`、`back`、`forward`、`reload`、`set-zoom`、`execute-js` 或 `state`。
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

浏览器会话按 `pluginId` 隔离并持久保存。插件应在 `browser-result` 中匹配 `requestId`，用 `browser-event` 更新导航状态；需要采集网页元素时，可在 `context-menu` 后调用 `execute-js`。该协议不依赖具体插件 ID，插件可以独立更新 UI、解析与输出逻辑。

## 仓库工作流

1. 在 `plugins/<plugin-id>` 新建插件目录。
2. 校验 `plugin.json` 是合法 JSON 且版本已递增。
3. 不提交密钥、Cookie、账号和本机绝对路径。
4. 在本地 HIOS 中通过 GitHub 子目录 URL 安装验证。
5. 验证启用、停用、更新、卸载、深浅主题和重启后的状态。
6. 合并到 `main` 后，用户可通过插件管理的更新按钮获取新版。

## 兼容性

仓库中的第三方插件均自行携带 `runtime` 界面与业务逻辑，不依赖主程序内的插件 ID 专用适配器。主程序只提供版本化消息协议、画布端口、目录选择和通用浏览器等稳定接口。插件新增页面、解析规则或交互时只需发布新的插件版本；仅在需要一种尚未开放的宿主级能力时，才需要升级 HIOS Next。
