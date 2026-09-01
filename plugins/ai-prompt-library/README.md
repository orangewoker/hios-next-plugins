# AI 提示词库

连接自托管的 [AI Prompt Library](https://github.com/orangewoker/AI-pml)，从一个或多个授权分类中随机抽取完整提示词，并通过 `text` 端口接入 HIOS 画布的 LLM、生图、视频等节点。

## 安装

在 HIOS Next 的“插件管理 → 安装插件”中粘贴：

```text
https://github.com/orangewoker/hios-next-plugins/tree/main/plugins/ai-prompt-library
```

安装后，在画布添加“随机提示词库”节点。

## 配置与使用

1. 在节点的“连接设置”中填写 AI Prompt Library 根地址，例如 `http://nas-ip:8765`，不要附加 `/api/v1`。
2. 填写 AI Prompt Library 网页“系统设置”中创建的 ComfyUI/API 访问密钥。
3. 点击“连接并读取分类”，勾选一个或多个分类；不勾选表示使用全部已授权分类。
4. 设置抽取数量和 Seed。Seed 为 `0` 时每次随机；非零 Seed 可复现同一结果。
5. 点击“随机抽取”。默认会自动把当前候选输出到画布 `prompt` 端口；也可在候选列表中切换后点击“输出到画布”。
6. 将 `prompt` 端口连接到提示词、LLM、生图或视频节点继续运行。

从下游节点或整张画布发起运行时，插件会响应 HIOS 的 `run` 消息，重新随机抽取并强制把最新提示词写入 `prompt` 输出端口；因此不需要先手动点击“随机抽取”。“抽取后自动输出”只控制手动抽取时是否立即输出，不会阻止工作流运行。

## 更新记录

- `0.1.1`：修复运行下游节点时插件不响应 `run`、提示词无法传递到下游的问题。
- `0.1.0`：首个公开版本。

服务地址和密钥只保存在 HIOS 的插件隔离存储中，不写入插件源码、`plugin.json` 或画布状态。画布只保存分类选择、随机参数和最近一次抽取结果。

## 服务端接口

插件只调用：

- `GET /api/v1/health`
- `GET /api/v1/categories?enabled_only=true`
- `POST /api/v1/random`

认证请求使用 `X-API-Key`。AI Prompt Library 需要允许 HIOS 插件来源跨域访问；默认 `CORS_ORIGINS=*` 可直接使用。

## 兼容要求

需要支持第三方插件 `text` 输出端口的 HIOS Next 版本。旧版本只能显示节点界面，不能把提示词传递到下游节点。
