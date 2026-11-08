# 提示词

HIOS 官方提示词订阅板块，与插件安装包独立。支持系统提示词（system）、正向提示词（positive）以及通用提示词（both）。

- [视觉创意导演 · 文生图提示词优化（系统）](system/visual-prompt-optimizer.md)
- [机器读取索引](index.json)
- 订阅地址：https://raw.githubusercontent.com/orangewoker/hios-next-plugins/main/prompts/index.json

## 使用方法与目录

- 系统提示词：用于 LLM 的系统指令，再在对话中提供具体任务或图片。
- 正向提示词：将【占位符】替换为实际内容后使用；图片编辑类需要同时上传底图，文字里提及参考图不会自动上传图片。
- 视频条目用于视频生成；配音条目的风格说明应放入服务的指令栏，朗读正文放入文本栏。仅支持纯文本朗读的服务不要直接朗读整份模板。
- 相机参数是视觉引导，不保证生成模型精确模拟；具体画幅、时长及输出参数仍以生成界面的设置为准。

### 系统提示词

- [番茄小说封面 · 书名与作者排版设计](system/tomato-novel-cover-designer.md)（输入书名、作者、简介，生成含准确文字与排版的封面提示词）

- [视觉创意导演 · 文生图提示词优化](system/visual-prompt-optimizer.md)
- [图片分析 · 反推可复现的视觉提示词](system/reference-image-analyst.md)
- [局部改图 · 保留主体与结构](system/precise-image-edit-director.md)
- [分镜导演 · 连贯镜头与角色一致性](system/storyboard-planner.md)
- [视频提示词 · 单镜头动作与运镜](system/video-prompt-designer.md)
- [室内设计 · 模型截图转效果图](system/interior-render-director.md)
- [中文润色 · 清晰自然不夸张](system/clear-copy-editor.md)

### 正向提示词

- [产品摄影 · 干净棚拍主图](positive/product-studio-photo.md)
- [人像摄影 · 窗边自然光](positive/natural-adult-portrait.md)
- [室内效果图 · 保持结构的日景渲染](positive/interior-daylight-render.md)
- [日景转夜景 · 保持空间与机位](positive/interior-night-edit.md)
- [角色设定 · 正侧背三视图](positive/character-three-views.md)
- [材质替换 · 只改指定对象](positive/material-replacement-edit.md)
- [美食摄影 · 温暖自然的菜单图](positive/food-editorial-photo.md)
- [海报设计 · 留白主视觉底图](positive/poster-key-visual.md)
- [产品视频 · 单镜头缓慢展示](positive/product-short-video.md)
- [配音指导 · 自然清晰的中文旁白](positive/voiceover-natural-narration.md)

## 发布新提示词（可直接在 GitHub 网页操作）

1. 在 `prompts/system/` 或 `prompts/positive/` 新建一个 `.md` 文件，只写提示词正文；文件中的标题、段落和换行会完整保留。
2. 编辑 `prompts/catalog.json`，在数组中增加一项（注意逗号）：

```json
{
  "id": "my-prompt",
  "title": "我的提示词",
  "kind": "positive",
  "tags": ["产品摄影"],
  "file": "positive/my-prompt.md"
}
```

3. 提交到 main。GitHub Actions 的 `Publish prompt index` 自动生成 `prompts/index.json` 并提交。等待 Actions 成功后，在 HIOS 提示词库点击“刷新”。
4. 修改正文无需更换 id；id 必须唯一且保持稳定。删除时从 catalog 移除对应项。刷新失败会保留旧缓存，本地收藏不会被覆盖。

本地发布也可先执行 `node scripts/build-prompts.mjs`，将正文、catalog 和生成的 index 一起提交。

客户端需使用包含官方来源及 JSON 索引支持的新版 HIOS（4.2.4 尚不支持此索引）。打开提示词库不会自动联网；来源可在“来源管理”中停用或删除。
