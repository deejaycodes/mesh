import type { ToolDefinition, ToolCall } from "./tool.js";

/**
 * A chat message in an LLM request. Role is normalised across providers.
 */
export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Required for role="tool" — must match a ToolCall.id from the previous assistant turn. */
  toolCallId?: string;
  /** Optional name for role="tool" messages. */
  name?: string;
  /** Present on role="assistant" messages that include tool calls. */
  toolCalls?: ToolCall[];
}

export interface LLMRequest {
  messages: LLMMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  tools?: ToolDefinition[];
}

export interface LLMResponse {
  content: string;
  model: string;
  toolCalls: ToolCall[];
  usage: TokenUsage;
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Provider-agnostic LLM client. Concrete implementations (OpenAI, Anthropic,
 * Bedrock, Ollama) ship in separate packages. The router composes them with
 * primary/fallback ordering.
 */
export interface LLMClient {
  readonly name: string;
  chat(request: LLMRequest): Promise<LLMResponse>;
}
