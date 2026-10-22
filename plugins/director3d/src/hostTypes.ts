// 从 Toonflow 节点宿主提取的结构类型；不依赖其运行时或请求实现。
export type NodeAiModel = {
  providerId: string;
  providerLabel: string;
  modelId: string;
  label: string;
  protocol: "openai-completions" | "openai-responses" | "anthropic-messages";
  contextWindow?: number;
  maxOutputTokens?: number;
};

export type NodeAiTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute(args: Record<string, unknown>, signal?: AbortSignal): unknown | Promise<unknown>;
};
