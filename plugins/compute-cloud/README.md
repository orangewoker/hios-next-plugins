# 算力云

算力云是一个完全独立的 HIOS Next 插件，用于调用 AutoDL.Art 包装的 ComfyUI 工作流 API。插件同时提供应用入口和画布节点，不需要修改或重新构建 HIOS 主程序。

## 功能

- 通过工作流 ID 自动读取 AutoDL 工作流参数定义。
- 保存并切换多个工作流。
- 根据 `input_rules` 自动生成文字、数字、枚举、布尔和媒体输入控件。
- 在应用中提交、轮询、恢复和下载异步任务。
- 在画布中连接提示词、图片、视频和音频节点。
- 输出图片、视频、音频、文件和任务 JSON。
- 内置 `minimax_h3_lightx2v_v5`（H3 多图参考生视频）配置入口。

## 使用

1. 安装插件后，从“应用”打开“算力云”。
2. 填写 AutoDL ComfyUI Token。Token 在 AutoDL.Art 的令牌管理中创建，分组选择 `ComfyUI`。
3. 点击“添加默认 H3 工作流”，或输入其他工作流 ID 后同步。
4. 可以直接在应用内运行，也可以在画布添加“算力云工作流”节点。

画布节点的 `images` 端口允许连接多张图片。H3 工作流会按连线顺序映射到 `ref_image_0` 至 `ref_image_8`。

## Token

Token 默认只保留在当前 HIOS 会话。启用“在此设备记住 Token”后，Token 会保存在该插件隔离的本地存储中，不会写入插件清单或项目文件。

## 异步任务

AutoDL 视频任务可能超过 HIOS 插件节点的同步等待时间。节点提交成功后会立即从 `task` 端口输出任务信息，并在后台继续轮询；最终结果完成后再从对应媒体端口输出。

“停止等待”只会停止本地轮询，不代表 AutoDL 云端任务已取消。

## API

- 工作流元数据：`GET /api/v1/comfyui/workflows/{workflow_id}`
- 提交任务：`POST /api/v1/comfyui/comfyui_workflow/{workflow_id}`
- 查询结果：`GET /api/v1/comfyui/comfyui_workflow/result/{task_id}`

默认服务地址：`https://autodl.art`
