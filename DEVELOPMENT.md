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
- `builtin`：官方桥接插件可选择 HIOS 内置适配器；第三方插件不应猜测未公开的适配器名。
- `rendererEntry` / `mainEntry`：为后续独立渲染和主进程入口预留。

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

## 仓库工作流

1. 在 `plugins/<plugin-id>` 新建插件目录。
2. 校验 `plugin.json` 是合法 JSON 且版本已递增。
3. 不提交密钥、Cookie、账号和本机绝对路径。
4. 在本地 HIOS 中通过 GitHub 子目录 URL 安装验证。
5. 验证启用、停用、更新、卸载、深浅主题和重启后的状态。
6. 合并到 `main` 后，用户可通过插件管理的更新按钮获取新版。

## 兼容性

`civitai-assets`、`xiaohongshu-assets` 和 `image-compare` 是官方桥接插件：仓库清单负责安装、激活、版本与更新，功能适配器由兼容版本的 HIOS Next 提供。安装前请更新 HIOS Next。
