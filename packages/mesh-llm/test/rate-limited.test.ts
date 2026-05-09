import { describe, it, expect } from "vitest";
import { RateLimitedLLMClient } from "../src/rate-limited.js";
import type { LLMClient, LLMRequest, LLMResponse } from "@corelay/mesh-core";

function createMockLLM(): { llm: LLMClient; callCount: () => number } {
  let count = 0;
  const llm: LLMClient = {
    name: "mock",
    async chat(): Promise<LLMResponse> {
      count++;
      return {
        content: `response-${count}`,
        model: "mock",
        toolCalls: [],
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        finishReason: "stop",
      };
    },
  };
  return { llm, callCount: () => count };
}

describe("RateLimitedLLMClient", () => {
  it("passes requests through to inner client", async () => {
    const { llm } = createMockLLM();
    const limited = new RateLimitedLLMClient(llm, { maxRequests: 10, windowMs: 1000 });

    const result = await limited.chat({ messages: [{ role: "user", content: "hi" }], model: "m" });
    expect(result.content).toBe("response-1");
  });

  it("has correct name", () => {
    const { llm } = createMockLLM();
    const limited = new RateLimitedLLMClient(llm);
    expect(limited.name).toBe("rate-limited:mock");
  });

  it("queues requests beyond the rate limit", async () => {
    const { llm, callCount } = createMockLLM();
    const limited = new RateLimitedLLMClient(llm, { maxRequests: 3, windowMs: 500 });

    const req: LLMRequest = { messages: [{ role: "user", content: "x" }], model: "m" };

    // Fire 5 requests simultaneously
    const results = await Promise.all([
      limited.chat(req),
      limited.chat(req),
      limited.chat(req),
      limited.chat(req),
      limited.chat(req),
    ]);

    // All should eventually resolve
    expect(results).toHaveLength(5);
    expect(callCount()).toBe(5);
  }, 10_000);

  it("propagates errors from inner client", async () => {
    const llm: LLMClient = {
      name: "failing",
      async chat(): Promise<LLMResponse> { throw new Error("API down"); },
    };
    const limited = new RateLimitedLLMClient(llm, { maxRequests: 10, windowMs: 1000 });

    await expect(limited.chat({ messages: [], model: "m" })).rejects.toThrow("API down");
  });
});
