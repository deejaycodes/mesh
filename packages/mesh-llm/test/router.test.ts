import { describe, it, expect } from "vitest";
import { LLMRouter } from "../src/router.js";
import type { LLMClient, LLMResponse } from "@corelay/mesh-core";

const fixedResponse = (from: string): LLMResponse => ({
  content: `from ${from}`,
  model: "model",
  toolCalls: [],
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  finishReason: "stop",
});

const ok = (name: string): LLMClient => ({
  name,
  async chat() {
    return fixedResponse(name);
  },
});

const failing = (name: string): LLMClient => ({
  name,
  async chat() {
    throw new Error(`${name} is down`);
  },
});

const req = { messages: [{ role: "user" as const, content: "hi" }], model: "m" };

describe("LLMRouter", () => {
  it("uses the primary provider when healthy", async () => {
    const router = new LLMRouter({
      primary: "openai",
      providers: [ok("openai"), ok("anthropic")],
    });

    const res = await router.chat(req);
    expect(res.content).toBe("from openai");
  });

  it("falls through to the next provider when the primary throws", async () => {
    const router = new LLMRouter({
      primary: "openai",
      fallbacks: ["anthropic"],
      providers: [failing("openai"), ok("anthropic")],
    });

    const res = await router.chat(req);
    expect(res.content).toBe("from anthropic");
  });

  it("respects the configured fallback order", async () => {
    const router = new LLMRouter({
      primary: "openai",
      fallbacks: ["bedrock", "anthropic"],
      providers: [failing("openai"), failing("bedrock"), ok("anthropic")],
    });

    const res = await router.chat(req);
    expect(res.content).toBe("from anthropic");
  });

  it("throws with an aggregate error when every provider fails", async () => {
    const router = new LLMRouter({
      primary: "openai",
      fallbacks: ["anthropic"],
      providers: [failing("openai"), failing("anthropic")],
    });

    await expect(router.chat(req)).rejects.toThrow(/all providers failed/i);
    await expect(router.chat(req)).rejects.toThrow(/openai/);
    await expect(router.chat(req)).rejects.toThrow(/anthropic/);
  });

  it("throws when the primary is not in the providers list", () => {
    expect(
      () =>
        new LLMRouter({
          primary: "missing",
          providers: [ok("openai")],
        }),
    ).toThrow(/primary.*missing/i);
  });

  it("skips unregistered fallbacks silently", async () => {
    const router = new LLMRouter({
      primary: "openai",
      fallbacks: ["never-registered", "anthropic"],
      providers: [failing("openai"), ok("anthropic")],
    });

    const res = await router.chat(req);
    expect(res.content).toBe("from anthropic");
  });

  it("has a name identifying it as the router", () => {
    const router = new LLMRouter({
      primary: "openai",
      providers: [ok("openai")],
    });
    expect(router.name).toBe("router");
  });
});
