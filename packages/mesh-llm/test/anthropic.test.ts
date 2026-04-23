import { describe, it, expect, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { AnthropicClient } from "../src/anthropic.js";

const makeMockClient = (
  response: Partial<Anthropic.Message>,
): { client: Anthropic; create: ReturnType<typeof vi.fn> } => {
  const create = vi.fn().mockResolvedValue({
    id: "m",
    type: "message",
    role: "assistant",
    model: "claude-3-5-sonnet-latest",
    content: [],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
    ...response,
  });
  return {
    client: { messages: { create } } as unknown as Anthropic,
    create,
  };
};

describe("AnthropicClient", () => {
  it("returns the assistant text and usage", async () => {
    const { client } = makeMockClient({
      content: [{ type: "text", text: "Hello!", citations: null }],
      usage: { input_tokens: 12, output_tokens: 8 } as Anthropic.Usage,
    });

    const c = new AnthropicClient({ client });
    const res = await c.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-3-5-sonnet-latest",
      maxTokens: 512,
    });

    expect(res.content).toBe("Hello!");
    expect(res.finishReason).toBe("stop");
    expect(res.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20 });
  });

  it("splits system messages out and concatenates them", async () => {
    const { client, create } = makeMockClient({});
    const c = new AnthropicClient({ client });
    await c.chat({
      messages: [
        { role: "system", content: "Be terse." },
        { role: "system", content: "Be kind." },
        { role: "user", content: "hi" },
      ],
      model: "claude-3-5-sonnet-latest",
      maxTokens: 100,
    });

    const call = create.mock.calls[0]?.[0];
    expect(call.system).toBe("Be terse.\n\nBe kind.");
    expect(call.messages).toEqual([{ role: "user", content: "hi" }]);
  });

  it("parses tool_use blocks into toolCalls", async () => {
    const { client } = makeMockClient({
      content: [
        { type: "text", text: "", citations: null },
        {
          type: "tool_use",
          id: "tool_1",
          name: "search",
          input: { query: "visa" },
        },
      ],
      stop_reason: "tool_use",
    });

    const c = new AnthropicClient({ client });
    const res = await c.chat({
      messages: [{ role: "user", content: "help" }],
      model: "claude-3-5-sonnet-latest",
      maxTokens: 100,
    });

    expect(res.toolCalls).toEqual([
      { id: "tool_1", name: "search", arguments: { query: "visa" } },
    ]);
    expect(res.finishReason).toBe("tool_calls");
  });

  it("translates tool results back to tool_result blocks", async () => {
    const { client, create } = makeMockClient({});
    const c = new AnthropicClient({ client });
    await c.chat({
      messages: [
        { role: "user", content: "search" },
        {
          role: "tool",
          content: "found 3 results",
          toolCallId: "tool_1",
        },
      ],
      model: "claude-3-5-sonnet-latest",
      maxTokens: 100,
    });

    const call = create.mock.calls[0]?.[0];
    expect(call.messages[1]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "tool_1", content: "found 3 results" },
      ],
    });
  });

  it("supplies a default max_tokens when the request omits it", async () => {
    const { client, create } = makeMockClient({});
    const c = new AnthropicClient({ client, defaultMaxTokens: 2048 });
    await c.chat({
      messages: [{ role: "user", content: "hi" }],
      model: "claude-3-5-sonnet-latest",
    });

    expect(create.mock.calls[0]?.[0].max_tokens).toBe(2048);
  });

  it("defaults name to 'anthropic'", () => {
    const c = new AnthropicClient({ client: makeMockClient({}).client });
    expect(c.name).toBe("anthropic");
  });
});
