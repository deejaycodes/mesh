import { describe, it, expect } from "vitest";
import { Agent, MemoryInbox, PeerRegistry, ToolRegistry, MemoryConversationBuffer } from "../src/index.js";
import type { LLMClient, LLMRequest, LLMResponse, Address, Message } from "../src/index.js";

/** Mock LLM that returns tool calls on first round, then text on second. */
function createToolCallingLLM(): LLMClient {
  let callCount = 0;
  return {
    name: "mock-tool-llm",
    async chat(request: LLMRequest): Promise<LLMResponse> {
      callCount++;
      // First call: return a tool call
      if (callCount === 1) {
        return {
          content: "",
          model: "mock",
          toolCalls: [{ id: "tc-1", name: "get_weather", arguments: { city: "Lagos" } }],
          usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
          finishReason: "tool_calls",
        };
      }
      // Second call (after tool result): return text
      return {
        content: "The weather in Lagos is 32°C and sunny.",
        model: "mock",
        toolCalls: [],
        usage: { promptTokens: 20, completionTokens: 10, totalTokens: 30 },
        finishReason: "stop",
      };
    },
  };
}

/** Mock LLM that echoes the last user message. */
function createEchoLLM(): LLMClient {
  return {
    name: "mock-echo",
    async chat(request: LLMRequest): Promise<LLMResponse> {
      const lastUser = request.messages.filter((m) => m.role === "user").pop();
      return {
        content: `Echo: ${lastUser?.content ?? "nothing"}`,
        model: "mock",
        toolCalls: [],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        finishReason: "stop",
      };
    },
  };
}

/** Mock LLM that returns the number of messages it received. */
function createCountingLLM(): LLMClient {
  return {
    name: "mock-counting",
    async chat(request: LLMRequest): Promise<LLMResponse> {
      return {
        content: `Received ${request.messages.length} messages`,
        model: "mock",
        toolCalls: [],
        usage: { promptTokens: 5, completionTokens: 5, totalTokens: 10 },
        finishReason: "stop",
      };
    },
  };
}

describe("Agent with tool execution", () => {
  it("executes tool calls and feeds results back to LLM", async () => {
    const registry = new PeerRegistry();
    const inbox = new MemoryInbox();
    const toolExecutor = new ToolRegistry({
      get_weather: async (args) => `${args.city}: 32°C, sunny`,
    });

    const agent = new Agent(
      "test/agent" as Address,
      {
        name: "weather-agent",
        description: "test",
        prompt: "You are a weather agent.",
        model: "mock",
        maxResponseTokens: 100,
        welcomeMessage: "",
        guardrails: "",
        tools: [{ name: "get_weather", description: "Get weather", parameters: {} }],
        capabilities: [{ kind: "peer", address: "test/caller" as Address }],
      },
      createToolCallingLLM(),
      inbox,
      registry,
      { toolExecutor },
    );

    let reply: Message | undefined;
    const caller = {
      address: "test/caller" as Address,
      async send(message: Message) { reply = message; },
    };
    registry.register(agent);
    registry.register(caller);

    await agent.start();
    await inbox.append({
      id: "msg-1",
      from: "test/caller" as Address,
      to: "test/agent" as Address,
      kind: "user",
      content: "What's the weather in Lagos?",
      traceId: "trace-1",
      createdAt: Date.now(),
    });

    // Wait for processing
    await new Promise((r) => setTimeout(r, 50));

    expect(reply).toBeDefined();
    expect(reply!.content).toContain("Lagos");
    expect(reply!.content).toContain("32°C");
  });
});

describe("Agent with conversation memory", () => {
  it("includes history in subsequent messages", async () => {
    const registry = new PeerRegistry();
    const inbox = new MemoryInbox();
    const memory = new MemoryConversationBuffer();

    const agent = new Agent(
      "test/agent" as Address,
      {
        name: "memory-agent",
        description: "test",
        prompt: "You are helpful.",
        model: "mock",
        maxResponseTokens: 100,
        welcomeMessage: "",
        guardrails: "",
        tools: [],
        capabilities: [{ kind: "peer", address: "test/caller" as Address }],
      },
      createCountingLLM(),
      inbox,
      registry,
      { memory },
    );

    const replies: Message[] = [];
    const caller = {
      address: "test/caller" as Address,
      async send(message: Message) { replies.push(message); },
    };
    registry.register(agent);
    registry.register(caller);

    await agent.start();

    // First message: system + user = 2 messages
    await inbox.append({
      id: "msg-1", from: "test/caller" as Address, to: "test/agent" as Address,
      kind: "user", content: "Hello", traceId: "trace-1", createdAt: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 50));

    // Second message: system + history(user+assistant) + user = 4 messages
    await inbox.append({
      id: "msg-2", from: "test/caller" as Address, to: "test/agent" as Address,
      kind: "user", content: "How are you?", traceId: "trace-1", createdAt: Date.now(),
    });
    await new Promise((r) => setTimeout(r, 50));

    expect(replies).toHaveLength(2);
    expect(replies[0]!.content).toBe("Received 2 messages"); // system + user
    expect(replies[1]!.content).toBe("Received 4 messages"); // system + user1 + assistant1 + user2
  });
});

describe("MemoryInbox backpressure", () => {
  it("throws when queue exceeds maxSize", async () => {
    const inbox = new MemoryInbox(2);

    const msg = (id: string): Message => ({
      id, from: "a" as Address, to: "b" as Address,
      kind: "user", content: "x", traceId: "t", createdAt: Date.now(),
    });

    await inbox.append(msg("1"));
    await inbox.append(msg("2"));
    await expect(inbox.append(msg("3"))).rejects.toThrow("backpressure");
  });
});
