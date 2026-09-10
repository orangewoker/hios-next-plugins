import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultsForWorkflow,
  mergeConnectedInputs,
  normalizeWorkflow,
  resultKind,
  submittedTask,
  taskSnapshot,
  validateAndBuildBody,
} from '../shared/core.js';

const metadata = {
  code: 'Success',
  data: {
    uuid: 'minimax_h3_lightx2v_v5',
    name: 'H3多图参考生视频',
    description: 'MiniMax H3多图参考生成视频',
    input_rules: {
      duration: { required: false, type: 'integer', default: 5, min: 1, max: 10 },
      prompt: { required: true, type: 'prompt', min_length: 1, max_length: 500000 },
      ref_image_0: { required: true, type: 'image', accept_types: ['image/jpeg', 'image/png', 'image/webp'] },
      ref_image_1: { required: false, type: 'image', default: 'default_local_path:/blank.png;https://example.test/blank.png' },
      source_file: { required: false, type: 'file' },
      resolution: { required: false, type: 'enum', default: '768p竖', options: [{ label: '480p竖' }, { label: '768p竖' }] },
      seed: { required: false, type: 'integer', default: 123, min: 1, max: 999999999999999 },
    },
    output_example: JSON.stringify({ code: 'Success', data: { status: 'completed', results: [{ url: 'https://example.test/video.mp4', type: 'video', file_type: 'mp4' }] } }),
  },
};

test('normalizes AutoDL workflow metadata', () => {
  const workflow = normalizeWorkflow(metadata);
  assert.equal(workflow.id, 'minimax_h3_lightx2v_v5');
  assert.equal(workflow.fields.length, 7);
  assert.equal(workflow.fields.find((field) => field.name === 'ref_image_1').defaultValue, '');
  assert.deepEqual(workflow.outputKinds, ['video']);
  assert.equal(defaultsForWorkflow(workflow).resolution, '768p竖');
});

test('maps connected images to ordered reference fields', () => {
  const workflow = normalizeWorkflow(metadata);
  const values = mergeConnectedInputs(workflow, { prompt: '节点内提示词' }, { prompt: '连线提示词', images: ['data:image/png;base64,AA==', 'https://example.test/ref.webp'], files: ['https://example.test/input.zip'] });
  assert.equal(values.prompt, '连线提示词');
  assert.equal(values.ref_image_0, 'data:image/png;base64,AA==');
  assert.equal(values.ref_image_1, 'https://example.test/ref.webp');
  assert.equal(values.source_file, 'https://example.test/input.zip');
});

test('builds typed request body and validates ranges', () => {
  const workflow = normalizeWorkflow(metadata);
  const body = validateAndBuildBody(workflow, { ...defaultsForWorkflow(workflow), prompt: '镜头缓慢推进', ref_image_0: 'https://example.test/ref.png', duration: '8' });
  assert.equal(body.duration, 8);
  assert.equal(body.prompt, '镜头缓慢推进');
  assert.equal(body.ref_image_0, 'https://example.test/ref.png');
  assert.throws(() => validateAndBuildBody(workflow, { prompt: 'x', ref_image_0: 'x', duration: 11 }), /不能大于 10/);
});

test('parses submitted and completed task envelopes', () => {
  const submitted = submittedTask({ code: 'Success', data: { task_id: 'task-1', status: 'QUEUED' } });
  assert.equal(submitted.taskId, 'task-1');
  const result = taskSnapshot({ code: 'Success', data: { task_id: 'task-1', status: 'SUCCESS', duration: 196, results: [{ url: 'https://example.test/out.mp4', type: 'video', file_type: 'mp4' }] } });
  assert.equal(result.terminal, true);
  assert.equal(result.success, true);
  assert.equal(result.results[0].kind, 'video');
});

test('detects output media from type and URL', () => {
  assert.equal(resultKind({ type: 'image' }), 'image');
  assert.equal(resultKind({ url: 'https://example.test/a.webm?token=1' }), 'video');
  assert.equal(resultKind({ file_type: 'wav' }), 'audio');
  assert.equal(resultKind({ url: 'https://example.test/archive.zip' }), 'file');
});
