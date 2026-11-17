// Public parameter manifests verified in the official console on 2026-11-17.
// Quotes are reference prices, not a server-enforced spending limit.
export const PRESETS = [
  {
    workflow_id: 'wf_04cec57e0b477ba0549e', revision_id: 'wfr_3421db4f3875133992f9',
    title: 'SeedVR2 放大', description: '自定义短边尺寸，放大输入图片。', quote_amount: '0.01000000', may_incur_external_model_cost: false,
    editable_parameter_manifest: [
      { name: 'node_1_image', label: '图像', value_type: 'image_input', required: true },
      { name: 'node_3_resolution', label: '短边尺寸', value_type: 'int', default: 2560, required: true },
    ],
    candidate_output_manifest: [{ name: 'result_5_images_1', type: 'image', display_name: 'seedvr2.png' }],
  },
  {
    workflow_id: 'wf_88ce66c7b6ff6c73f7ab', revision_id: 'wfr_f348719252bd9e64f93c',
    title: 'Qwen Image2.1 图像编辑', description: '支持提示词、宽高比、百万像素与最多 8 张参考图。', quote_amount: '0.06000000', may_incur_external_model_cost: false,
    editable_parameter_manifest: [
      { name: 'node_485_text', label: '提示词文本', value_type: 'string', default_value: '将人物发色变为金色', required: true },
      { name: 'node_13_aspect_ratio', label: '宽高比', value_type: 'string', default_value: '9:16 (Portrait Widescreen)', options: ['1:1 (Square)', '2:3 (Portrait Photo)', '3:2 (Photo)', '3:4 (Portrait Standard)', '4:3 (Standard)', '9:16 (Portrait Widescreen)', '16:9 (Widescreen)', '21:9 (Ultrawide)'], required: true },
      { name: 'node_13_megapixels', label: '百万像素', value_type: 'float', default_value: 1, required: true },
      ...Array.from({ length: 8 }, (_, i) => ({ name: `node_${542 + i}_image`, label: `参考图 ${i + 1}`, value_type: 'image_input', required: i === 0 })),
    ],
    candidate_output_manifest: [{ name: 'result_550_images_1', type: 'image', display_name: 'qwen-edit.png' }],
  },
];
