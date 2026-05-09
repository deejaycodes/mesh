import type OpenAI from "openai";
import type {
  LLMClient,
  LLMRequest,
  LLMResponse,
  ToolCall,
} from "@corelay/mesh-core";

export interface OpenAIClientConfig {
  /**
   * A pre-constructed OpenAI client. The caller imports and instantiates
   * OpenAI themselves so the sdk stays an optional peer dependency.
   */
  client: OpenAI;
  /** Logical name. Defaults to "openai". */
  name?: string;
  /** Max retries on transient errors (429, 500, 502, 503, 504). Default 3. */
  maxRetries?: number;
}

const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/**
 * Wraps the OpenAI SDK as an `LLMClient`. Supports plain chat, tool calls,
 * and automatic retry with exponential backoff on transient errors.
 */
export class OpenAIClient implements LLMClient {
  readonly name: string;
  private readonly client: OpenAI;
  private readonly maxRetries: number;

  constructor(config: OpenAIClientConfig) {
    this.client = config.client;
    this.name = config.name ?? "openai";
    this.maxRetries = config.maxRetries ?? 3;
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      if (attempt > 0) {
        await sleep(Math.min(1000 * 2 ** (attempt - 1), 8000));
      }

      try {
        return await this.doChat(request);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        // Check if retryable
        const status = (err as { status?: number }).status;
        if (status && !RETRYABLE_STATUS_CODES.has(status)) {
          throw lastError; // Non-retryable — fail immediately
        }
      }
    }

    throw lastError ?? new Error("OpenAI: max retries exceeded");
  }

  private async doChat(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.chat.completions.create({
      model: request.model,
      messages: request.messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.toolCallId !== undefined && { tool_call_id: m.toolCallId }),
        ...(m.name !== undefined && { name: m.name }),
        ...(m.toolCalls?.length && {
          tool_calls: m.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        }),
      })) as OpenAI.Chat.Completions.ChatCompletionMessageParam[],
      max_tokens: request.maxTokens,
      temperature: request.temperature ?? 0.7,
      ...(request.tools?.length && {
        tools: request.tools.map((t) => ({
          type: "function" as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        })),
      }),
    });

    const choice = response.choices[0];
    const toolCalls: ToolCall[] = (choice?.message.tool_calls ?? [])
      .filter((tc) => tc.type === "function")
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeJson(tc.function.arguments),
      }));

    return {
      content: choice?.message.content ?? "",
      model: response.model,
      toolCalls,
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      finishReason: toFinishReason(choice?.finish_reason),
    };
  }
}

const safeJson = (s: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(s);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
};

const toFinishReason = (
  reason: OpenAI.Chat.Completions.ChatCompletion.Choice["finish_reason"] | undefined,
): LLMResponse["finishReason"] => {
  if (reason === "tool_calls") return "tool_calls";
  if (reason === "length") return "length";
  return "stop";
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
