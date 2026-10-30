# 上游来源与复用范围

研究基线：2026-10-30 的以下仓库 main 分支。

- https://github.com/orangewoker/comfyui-portrait-gallery
- https://github.com/orangewoker/comfyui-costume-gallery
- https://github.com/orangewoker/comfyui-pose-gallery

人物 `web/core.mjs` 原样保留为 `runtime/vendor/portrait-core.mjs`，筛选函数直接调用；服装 `web/gallery.mjs` 的分类/多词 AND 检索、姿势 `web/gallery.html` 的「体系 + 姿势编号」分组和多视角关系改编为 `runtime/gallery-core.mjs`。ComfyUI 包装层、Python 张量输出和网站展示布局未引入。

相关作者：ai-portrait-gallery-zh contributors、Deeyu、Anhao；原始人物素材作者 あぎ，服装/姿势素材作者 ギア。各上游的 MIT 许可和范围说明完整保存于 `licenses/`。

本插件不包含第三方图片、原始或翻译索引。代码许可不覆盖这些素材。姿势上游许可明确列有非商业使用范围，服装素材按原权利人条款，人物上游说明记录 CC0 标注及原站附带请求。用户主动点击素材库下载按钮时，宿主按 data-packs.json 的固定提交从上述用户指定的图库仓库下载素材；也可关联自己的完整本地图库。插件代码仓库与 HIOS 主安装包不包含这些素材。下载和使用不改变原作品许可；本次发布不创建新的素材镜像。

原站：
- https://ai-portrait-gallery.pages.dev/
- https://ai-costume-gallery.pages.dev/
- https://ai-pose-gallery.pages.dev/
