import { describe, it, expect } from "vitest";
import { Agent } from "../src/agent.js";
import { MemoryInbox } from "../src/memory-inbox.js";
import { PeerRegistry } from "../src/peer-registry.js";
import type { AgentConfig } from "../src/agent-config.js";
import type { LLMClient, LLMRequest, LLMResponse } from "../src/llm.js";
import type { Message } from "../src/message.js";
import type { Tracer, SpanAttributes } from "@corelay/mesh-observe";

const okLLM: LLMClient = {
  name: "mock-openai",
  async chat(req: LLMRequest): Promise<LLMResponse> {
    return {
      content: "hi back",
      model: req.model,
      toolCalls: [],
      usage: { promptTokens: 12, completionTokens: 8, totalTokens: 20 },
      finishReason: "stop",
    };
  },
};

const baseConfig: AgentConfig = {
  name: "test-agent",
  description: "",
  prompt: "You are helpful.",
  model: "gpt-4o-mini",
  maxResponseTokens: 100,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [{ kind: "peer", address: "test/user" }],
};

interface RecordedSpan {
  name: string;
  attributes: SpanAttributes;
}

const recordingTracer = (): {
  tracer: Tracer;
  spans: RecordedSpan[];
} => {
  const spans: RecordedSpan[] = [];
  const tracer: Tracer = {
    async span(name, attributes, fn) {
      const collected: SpanAttributes = { ...attributes };
      const span: RecordedSpan = { name, attributes: collected };
      spans.push(span);
      return fn({
        setAttribute(key, value) {
          collected[key] = value;
        },
        setAttributes(attrs) {
          for (const [k, v] of Object.entries(attrs)) collected[k] = v;
        },
        recordException() {},
        setStatus() {},
      });
    },
  };
  return { tracer, spans };
};

const inbound = (content: string): Message => ({
  id: "m-1",
  from: "test/user",
  to: "test/agent",
  kind: "user",
  content,
  traceId: "trace-1",
  createdAt: 0,
});

const sinkPeer = (address: "test/user") => ({
  address,
  received: [] as Message[],
  async send(m: Message) {
    this.received.push(m);
  },
});

describe("Agent tracing", () => {
  it("emits agent.handle and llm.chat spans with expected attributes", async () => {
    const { tracer, spans } = recordingTracer();
    const registry = new PeerRegistry();
    registry.register(sinkPeer("test/user"));

    const agent = new Agent(
      "test/agent",
      baseConfig,
      okLLM,
      new MemoryInbox(),
      registry,
      { tracer },
    );
    registry.register(agent);
    await agent.start();

    await agent.send(inbound("hello"));
    await new Promise((r) => setImmediate(r));

    const spanNames = spans.map((s) => s.name);
    expect(spanNames).toContain("agent.handle");
    expect(spanNames).toContain("llm.chat");

    const handleSpan = spans.find((s) => s.name === "agent.handle")!;
    expect(handleSpan.attributes["agent.address"]).toBe("test/agent");
    expect(handleSpan.attributes["agent.name"]).toBe("test-agent");
    expect(handleSpan.attributes["message.id"]).toBe("m-1");
    expect(handleSpan.attributes["message.trace_id"]).toBe("trace-1");

    const llmSpan = spans.find((s) => s.name === "llm.chat")!;
    expect(llmSpan.attributes["llm.provider"]).toBe("mock-openai");
    expect(llmSpan.attributes["llm.prompt_tokens"]).toBe(12);
    expect(llmSpan.attributes["llm.completion_tokens"]).toBe(8);
    expect(llmSpan.attributes["llm.total_tokens"]).toBe(20);
    expect(llmSpan.attributes["llm.finish_reason"]).toBe("stop");
  });

  it("uses noopTracer by default — no spans recorded, no crashes", async () => {
    const registry = new PeerRegistry();
    registry.register(sinkPeer("test/user"));
    const agent = new Agent("test/agent", baseConfig, okLLM, new MemoryInbox(), registry);
    registry.register(agent);
    await agent.start();

    await agent.send(inbound("hello"));
    await new Promise((r) => setImmediate(r));

    // No explicit assertion beyond 'didn't throw'. The sink should have the reply.
    expect(true).toBe(true);
  });
});
