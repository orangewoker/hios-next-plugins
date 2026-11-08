# 提示词

HIOS 官方提示词订阅板块，与插件安装包独立。支持系统提示词（system）、正向提示词（positive）以及通用提示词（both）。

- [视觉创意导演 · 文生图提示词优化（系统）](system/visual-prompt-optimizer.md)
- [机器读取索引](index.json)
- 订阅地址：https://raw.githubusercontent.com/orangewoker/hios-next-plugins/main/prompts/index.json

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
