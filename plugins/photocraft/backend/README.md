# PSD v2 参考服务兼容扩展

适用于 `chatgpt2api-h`，基准提交 `005cf67e981494ec873f35583719d4109dc1ae9b`。本目录不是插件运行时依赖；需要把补丁部署到所选 AI 路由的服务器，再重启服务。

```powershell
Set-Location "D:/AIGC/00DS/chatgpt2api-h"
git apply --check "D:/AIGC/00DS/HIOS NEXT/plugins/photocraft/backend/chatgpt2api-h-psd-v2.patch"
git apply "D:/AIGC/00DS/HIOS NEXT/plugins/photocraft/backend/chatgpt2api-h-psd-v2.patch"
```

如果这三个文件已经包含本次改动，不要重复应用。本次开发工作区的参考项目已经应用；尚未替你重启或部署远端服务。

## 接口

- `GET /v1/psd/capabilities`：经 Bearer 鉴权，返回 `{"version":2,"model_selection":true,"psd_only":true}`。
- `POST /v1/psd/generations`：在原有 `prompt`、`base64_images`、`client_task_id` 之外接受 `model` 与 `include_zip`。插件固定 `include_zip:false`；保留原图像素尺寸、坐标和独立图层，目标层数写在提示词内。
- `GET /v1/editable-file-tasks?ids=...`：原接口不变，任务增加实际提交的 `model` 和 `include_zip` 确认字段。任务成功时读取 `result.primary_url`，不读取 ZIP。
- 不传新参数时，旧调试页/PPT 保持默认模型与 ZIP 行为。

`model` 会传入真实文件工具会话的 prepare 与 conversation 两个请求，不再忽略客户端选择。所选模型需由上游 ChatGPT 账户实际支持，且支持文件工具；普通 OpenAI 聊天接口不能替代此文件接口。接口报告的是实际提交模型，不保证上游不会内部映射别名。

`include_zip:false` 时提示词只要求 PSD，文件等待器只等 PSD，并只下载 PSD；不再把没有 ZIP 判为失败。上游 SSE 读取等待增至 30 分钟，后续 artifact 等待保持原有 20 分钟，HIOS 的总等待上限为 30 分钟。

本补丁不新增服务端中止工具会话的能力。取消会中止 HIOS HTTP/轮询和导入；上游已开始的生成可能继续执行。任务记录持久化且客户端任务 ID 幂等，重载插件不会重复提交。

## 验证

HIOS 工作区可运行 `python tests/photocraft-psd-backend.test.py`。测试 AST 提取真实修改方法并隔离账户/配置依赖，检查自选模型、无 ZIP 完成与旧调用兼容，不发起真实付费请求。
