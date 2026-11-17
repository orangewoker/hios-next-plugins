import { buildSubmission, checkQuote, snapshot } from './core.js';

export function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason || new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
async function fingerprint(workflow, values) {
  const text = JSON.stringify([workflow.id, workflow.revisionId, Object.entries(values).sort(([a], [b]) => a.localeCompare(b))]);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function submitRun({ client, workflow, values, config, store, signal, onProgress = () => {} }) {
  checkQuote(workflow, config.quoteLimit);
  const body = buildSubmission(workflow, values, `hios_${crypto.randomUUID()}`);
  const hash = await fingerprint(workflow, body.inputs);
  const submit = async () => {
    const unresolved = store.loadTasks().find(t => t.fingerprint === hash && !t.terminal);
    if (unresolved) throw new Error('相同参数的任务尚未结束或提交状态不确定，请在任务记录继续查询；不会重复提交付费任务');
    onProgress({ status: 'preparing', progress: 0, message: '正在上传本地素材' });
    body.inputs = await client.prepareInputs(workflow, body.inputs, signal);
    signal?.throwIfAborted();
    const pending = { idempotencyKey: body.idempotency_key, fingerprint: hash, workflowId: workflow.id, workflowName: workflow.name,
      workflow, body, status: 'submitting', runOrderId: '', terminal: false, createdAt: Date.now() };
    // Persist BEFORE the paid request. A connection failure is ambiguous, not a failed task.
    store.saveTask(pending);
    onProgress({ status: 'submitting', progress: 0, message: '正在提交晨羽任务' });
    try {
      const submitted = await client.submit(body, signal);
      if (!submitted.run_order_id) throw new Error('提交响应缺少 run_order_id');
      return store.saveTask({ ...pending, runOrderId: submitted.run_order_id, taskId: submitted.task_id,
        status: submitted.run_status || 'queued', quoteAmount: submitted.quote_amount, body: undefined });
    } catch (error) {
      store.saveTask({ ...pending, status: 'submission_unknown', message: '提交结果未确认，可用原幂等键恢复；禁止新键自动重试' });
      throw error;
    }
  };
  // Web Locks serialize preflight+submit across visible and hidden provider frames.
  return globalThis.navigator?.locks
    ? navigator.locks.request('chenyu-cloud-submit', { signal }, submit)
    : submit();
}
export async function resumeSubmission(task, client, store, signal) {
  if (task.runOrderId) return task;
  if (!task.body || task.body.idempotency_key !== task.idempotencyKey) throw new Error('缺少原请求，不能安全恢复提交');
  // User-triggered only. Preserve the EXACT payload and idempotency key.
  const submitted = await client.submit(task.body, signal);
  if (!submitted.run_order_id) throw new Error('恢复响应缺少 run_order_id');
  return store.saveTask({ ...task, runOrderId: submitted.run_order_id, taskId: submitted.task_id,
    status: submitted.run_status || 'queued', quoteAmount: submitted.quote_amount, body: undefined });
}
export async function pollRun({ client, task, config, store, signal, onProgress = () => {}, wait = delay }) {
  const started = Date.now(), deadline = started + config.maxWaitMinutes * 60000;
  let failures = 0;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    let info, execution;
    try {
      info = await client.info(task.runOrderId, signal);
      // Progress is supplementary; an execution-endpoint failure must not hide final outputs.
      execution = await client.execution(task.runOrderId, signal).catch(() => ({}));
      failures = 0;
    } catch (error) {
      signal?.throwIfAborted();
      if (++failures >= 5) throw new Error(`连续查询失败，任务仍保留在记录中：${error.message}`);
      onProgress({ taskId: task.runOrderId, status: 'reconnecting', message: '查询暂时失败，正在重连；不会重提任务' });
      await wait(config.pollIntervalMs * failures, signal); continue;
    }
    const current = snapshot(info, execution, task.workflow);
    task = store.saveTask({ ...task, ...current, runOrderId: task.runOrderId });
    onProgress({ taskId: task.runOrderId, status: task.status, progress: task.progress, message: task.message || `晨羽：${task.status}` });
    if (task.terminal) {
      if (!task.success) throw new Error(task.message || `晨羽任务${task.status}`);
      return { taskId: task.runOrderId, workflowId: task.workflowId, workflowName: task.workflowName,
        outputs: task.outputs.map(output => ({ ...output, metadata: { ...output.metadata, runOrderId: task.runOrderId, workflowId: task.workflowId,
          revisionId: task.workflow.revisionId, quoteAmount: task.quoteAmount, finalAmount: task.finalAmount, settlementStatus: task.settlementStatus } })) };
    }
    await wait(config.pollIntervalMs, signal);
  }
  throw new Error(`等待超过 ${config.maxWaitMinutes} 分钟，云端任务已保留，可在任务记录继续查询`);
}
