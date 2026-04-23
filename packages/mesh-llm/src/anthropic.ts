import type Anthropic from "@anthropic-ai/sdk";
import type {
  LLMClient,
  LLMMessage,
  LLMRequest,
  LLMResponse,
  ToolCall,
} from "@corelay/mesh-core";

export interface AnthropicClientConfig {
  /**
   * A pre-constructed Anthropic client. Keeps the sdk an optional peer dep.
   */
  client: Anthropic;
  /** Logical name. Defaults to "anthropic". */
  name?: string;
  /**
   * Default max_tokens when the request doesn't specify one.
   * Anthropic requires max_tokens on every call. Defaults to 1024.
   */
  defaultMaxTokens?: number;
}

/**
 * Wraps the Anthropic SDK as an `LLMClient`. Translates the platform's
 * unified message/tool schema to Anthropic's format and back.
 */
export class AnthropicClient implements LLMClient {
  readonly name: string;
  private readonly client: Anthropic;
  private readonly defaultMaxTokens: number;

  constructor(config: AnthropicClientConfig) {
    this.client = config.client;
    this.name = config.name ?? "anthropic";
    this.defaultMaxTokens = config.defaultMaxTokens ?? 1024;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const systemMessages = request.messages.filter((m) => m.role === "system");
    const system = systemMessages.map((m) => m.content).join("\n\n");
    const messages = request.messages.filter((m) => m.role !== "system");

    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      ...(system && { system }),
      ...(request.temperature !== undefined && { temperature: request.temperature }),
      messages: messages.map(toAnthropicMessage) as Anthropic.MessageParam[],
      ...(request.tools?.length && {
        tools: request.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters as Anthropic.Tool.InputSchema,
        })),
      }),
    });

    const content = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolCalls: ToolCall[] = response.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({
        id: b.id,
        name: b.name,
        arguments: (b.input as Record<string, unknown>) ?? {},
      }));

    return {
      content,
      model: response.model,
      toolCalls,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      finishReason: toFinishReason(response.stop_reason),
    };
  }
}

const toAnthropicMessage = (m: LLMMessage): Anthropic.MessageParam => {
  if (m.role === "tool") {
    return {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: m.toolCallId ?? "",
          content: m.content,
        },
      ],
    };
  }
  return {
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  };
};

const toFinishReason = (
  reason: Anthropic.Message["stop_reason"],
): LLMResponse["finishReason"] => {
  if (reason === "tool_use") return "tool_calls";
  if (reason === "max_tokens") return "length";
  return "stop";
};
