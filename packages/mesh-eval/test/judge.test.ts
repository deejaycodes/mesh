import { describe, it, expect } from "vitest";
import type { LLMClient, LLMRequest, LLMResponse } from "@corelay/mesh-core";
import { createLlmJudge } from "../src/index.js";

class ScriptedLLM implements LLMClient {
  readonly name = "scripted";
  lastRequest?: LLMRequest;
  constructor(private readonly reply: string) {}
  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = request;
    return {
      content: this.reply,
      model: request.model,
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    };
  }
}

const input = { criterion: "is trauma-informed", reply: "r", originalInput: "i" };

describe("createLlmJudge()", () => {
  it("returns the verdict from a valid JSON reply", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ pass: true, rationale: "Clear." }));
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(true);
    expect(v.rationale).toBe("Clear.");
  });

  it("accepts verdicts wrapped in ```json fences", async () => {
    const llm = new ScriptedLLM('```json\n{"pass":false,"rationale":"Off"}\n```');
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(false);
    expect(v.rationale).toBe("Off");
  });

  it("fails closed on invalid JSON", async () => {
    const llm = new ScriptedLLM("not json");
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(false);
    expect(v.rationale).toContain("invalid JSON");
  });

  it("fails closed on a non-object", async () => {
    const llm = new ScriptedLLM(JSON.stringify(["not", "an", "object"]));
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(false);
  });

  it("fails closed when pass is missing", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ rationale: "no pass key" }));
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(false);
  });

  it("supplies a fallback rationale when missing", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ pass: true }));
    const judge = createLlmJudge(llm);
    const v = await judge.judge(input);
    expect(v.pass).toBe(true);
    expect(v.rationale).toContain("did not supply");
  });

  it("sends a judge system prompt identifying itself", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ pass: true, rationale: "ok" }));
    const judge = createLlmJudge(llm);
    await judge.judge(input);
    const system = llm.lastRequest?.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("evaluation judge");
    expect(system?.content).toContain("JSON");
  });

  it("uses temperature 0 by default for determinism", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ pass: true, rationale: "ok" }));
    const judge = createLlmJudge(llm);
    await judge.judge(input);
    expect(llm.lastRequest?.temperature).toBe(0);
    expect(llm.lastRequest?.model).toBe("gpt-4o-mini");
  });

  it("honours caller overrides", async () => {
    const llm = new ScriptedLLM(JSON.stringify({ pass: true, rationale: "ok" }));
    const judge = createLlmJudge(llm, { model: "claude-3-5-sonnet-20241022", temperature: 0.4 });
    await judge.judge(input);
    expect(llm.lastRequest?.model).toBe("claude-3-5-sonnet-20241022");
    expect(llm.lastRequest?.temperature).toBe(0.4);
  });
});
