# 模特 · HIOS 参考图库

一个三槽节点，分别选择人物、服装、姿势，输出 1–3 张独立 PNG 原图。不运行 ComfyUI，不执行换装、换脸或生成，主程序不捆绑第三方素材。

## 安装

在 HIOS Next 3.8.0 或更新版本中，通过插件管理的「本地目录」安装本目录。旧宿主没有 `features.outputBatch / expandedView / resourceDirectories` 时需更新宿主；本插件不是预装插件。

1. 添加「模特」节点，点击任一槽位或「选择素材」。
2. 安装时自动下载三套图库（约 6.62 GiB），安装成功后自动关联，无需手动 clone。可选在「图库设置」替换为已有本地仓库根目录或 `library` 目录：
   - `comfyui-portrait-gallery`：`data/portrait-zh.json`、`img/full`、`img/thumb`。
   - `comfyui-costume-gallery`：`data/costume-zh.json`、`png`、`img`、`thumbs`。
   - `comfyui-pose-gallery`：`data/pose-zh.json`、`img`、`thumbs`。
3. 单击预览，点击「选用此图片」（或双击卡片）加入草稿组合。姿势默认按组浏览，在右侧切换具体视角。
4. 「应用选择」保存至发起窗口的节点；「取消」和宿主关闭按钮丢弃草稿。
5. 勾选本次输出的槽位，点击节点的「运行」。`portrait`、`costume`、`pose` 是三个独立端口。可选同时在画布上创建图片节点。

浏览不触发模型。输出按整批提交，缺原图不使用缩略图顶替；没有勾选的槽位不输出旧结果。原图保持 PNG、尺寸和透明通道，未实现白底转换。输出持久化至 HIOS 资源库；关联目录移走后，既有输出仍能显示，但重新运行需要重新关联。

图库索引按需读取，列表每批 60 个缩略图。人物默认正脸；造型与正脸不是身份配对。姿势默认单人，双人素材可取消筛选查看；不会自动生成深度图或骨骼图。

本地授权目录由宿主持久化并按账户/插件隔离；节点只保存目录 ID，不保存绝对路径。收藏/最近使用是当前插件浏览器的本地偏好。可在设置中选择以前授权的目录；替换目录会清空该类型的草稿选择。

## 测试

在 HIOS 工作区运行：

```text
node --test tests/model-gallery.test.mjs tests/plugin-port-output.test.mjs tests/plugin-resources.test.mjs
node scripts/sync-plugin-ui.mjs
node scripts/check-plugin-ui.mjs
```

UI 回归测试另见 `tests/model-gallery-ui-regression.cjs`。上游逻辑和许可范围见 `THIRD_PARTY_NOTICES.md` 与 `licenses/`。

## 安装下载与缓存

- `install.dataPacks` 声明固定提交的 `data-packs.json`；插件源码包仅包含代码和文件清单，不包含图片。HIOS 主安装包也不包含这些图库。
- 仅显式安装/更新插件时下载，启动 HIOS、打开节点、浏览图库不会下载全库。
- 插件管理显示文件数、已完成字节、总大小，可取消。默认下载源每个文件最多尝试三次；失败后重新安装会校验复用已完成文件，未完成文件重新下载。
- 每个文件同时校验大小与 Git blob SHA-1；完整成功后才激活插件。代码升级复用相同清单的数据，不重复下载。
- 下载缓存位于 HIOS 用户数据目录的 `plugin-data-packs/model-gallery`，与主程序安装目录分离。卸载插件停止访问但保留缓存供重装使用；如需释放空间，退出 HIOS 后手动删除该缓存目录。
- 图库固定在清单指定版本，不自动追踪上游 main；更新图库需发布新的插件清单。

## 下载源与后续 CDN

当前从你指定的三个 `orangewoker/comfyui-*-gallery` 仓库的固定提交，通过 `raw.githubusercontent.com` 下载；GitHub 插件代码更新不携带 6.62 GiB 图片。安装需要能够访问 GitHub Raw 的网络环境；网络不可达时可更换可达网络，或由发布者配置下述受信任 CDN 镜像后重试。已完成文件不会重下。

宿主 3.8.0 支持可选 `packs[].mirrors`（最多三个 HTTPS 基址）。CDN 按 `<base>/<owner>/<repo>/<commit>/library/<relative path>` 保存文件；镜像失败或哈希不符会尝试下一个源及 GitHub Raw。改变镜像地址不会使已验证缓存失效。当前没有配置 CDN，不宣称已具备国内加速。

长期分发建议使用对象存储（OSS/COS/R2）配 CDN，由拥有素材分发权限的一方配置桶和域名；不要将数据提交到插件仓库，也不建议把 6.62 GiB 打成一个巨型 ZIP。先迁移现有逐文件结构即可兼容宿主，避免全量重下和额外解压空间。
