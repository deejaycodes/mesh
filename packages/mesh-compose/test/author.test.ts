import { describe, it, expect } from "vitest";
import type { LLMClient, LLMRequest, LLMResponse } from "@corelay/mesh-core";
import { compose, createLlmAuthor, renderSpec } from "../src/index.js";
import type { ComposeSpec } from "../src/index.js";

class CapturingLLM implements LLMClient {
  readonly name = "fake";
  lastRequest?: LLMRequest;
  constructor(private readonly reply: string) {}
  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.lastRequest = request;
    return {
      content: this.reply,
      model: request.model,
      toolCalls: [],
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      finishReason: "stop",
    };
  }
}

const validDraft = JSON.stringify({
  name: "triage",
  description: "First-contact triage.",
  prompt: "You are a triage assistant.",
  welcomeMessage: "Hi — what's happening?",
  reviewerQuestions: ["Is the tone right?"],
});

const baseSpec: ComposeSpec = {
  intent: "First-contact triage for survivors of domestic abuse.",
  domain: ["safeguarding", "UK"],
  guardrails: ["Never minimise.", "Never ask why."],
  allowedPeers: ["safevoice/caseworker"],
};

describe("renderSpec()", () => {
  it("renders intent as the first line", () => {
    const out = renderSpec({ intent: "hello world" });
    expect(out.split("\n")[0]).toBe("Intent: hello world");
  });

  it("includes domain tags when present", () => {
    const out = renderSpec({ intent: "x", domain: ["a", "b", "c"] });
    expect(out).toContain("Domain: a, b, c");
  });

  it("renders worked examples with 1-based numbering", () => {
    const out = renderSpec({
      intent: "x",
      examples: [
        { input: "hey", desiredReply: "hi" },
        { input: "help", desiredReply: "here to help" },
      ],
    });
    expect(out).toContain("1. Input: hey");
    expect(out).toContain("2. Input: help");
    expect(out).toContain("Desired reply: hi");
  });

  it("lists guardrails as bullets with an 'enforced separately' hint", () => {
    const out = renderSpec(baseSpec);
    expect(out).toContain("enforced separately");
    expect(out).toContain("- Never minimise.");
    expect(out).toContain("- Never ask why.");
  });

  it("lists allowed peers", () => {
    const out = renderSpec(baseSpec);
    expect(out).toContain("safevoice/caseworker");
  });

  it("omits empty sections cleanly", () => {
    const out = renderSpec({ intent: "minimal" });
    expect(out).not.toContain("Domain:");
    expect(out).not.toContain("Worked examples");
    expect(out).not.toContain("Guardrails");
    expect(out).not.toContain("Allowed peer addresses");
  });

  it("is deterministic — same input, same output", () => {
    expect(renderSpec(baseSpec)).toBe(renderSpec(baseSpec));
  });
});

describe("createLlmAuthor()", () => {
  it("wraps an LLMClient into a ComposeAuthor", async () => {
    const llm = new CapturingLLM(validDraft);
    const author = createLlmAuthor(llm);
    const output = await author.draft(baseSpec);
    expect(output).toBe(validDraft);
  });

  it("sends a system prompt identifying itself as Compose", async () => {
    const llm = new CapturingLLM(validDraft);
    const author = createLlmAuthor(llm);
    await author.draft(baseSpec);
    const system = llm.lastRequest?.messages.find((m) => m.role === "system");
    expect(system?.content).toContain("Corelay Compose");
    expect(system?.content).toContain("JSON");
  });

  it("sends the rendered spec as the user turn", async () => {
    const llm = new CapturingLLM(validDraft);
    const author = createLlmAuthor(llm);
    await author.draft(baseSpec);
    const user = llm.lastRequest?.messages.find((m) => m.role === "user");
    expect(user?.content).toBe(renderSpec(baseSpec));
  });

  it("uses the default model + low temperature", async () => {
    const llm = new CapturingLLM(validDraft);
    const author = createLlmAuthor(llm);
    await author.draft(baseSpec);
    expect(llm.lastRequest?.model).toBe("gpt-4o-mini");
    expect(llm.lastRequest?.temperature).toBe(0.2);
    expect(llm.lastRequest?.maxTokens).toBe(800);
  });

  it("honours caller-supplied options", async () => {
    const llm = new CapturingLLM(validDraft);
    const author = createLlmAuthor(llm, {
      model: "claude-3-5-sonnet-20241022",
      temperature: 0.7,
      maxTokens: 1200,
    });
    await author.draft(baseSpec);
    expect(llm.lastRequest?.model).toBe("claude-3-5-sonnet-20241022");
    expect(llm.lastRequest?.temperature).toBe(0.7);
    expect(llm.lastRequest?.maxTokens).toBe(1200);
  });

  it("composes end-to-end with compose()", async () => {
    const llm = new CapturingLLM(validDraft);
    const draft = await compose(baseSpec, createLlmAuthor(llm));
    expect(draft.config.name).toBe("triage");
    expect(draft.config.prompt).toContain("triage assistant");
    expect(draft.config.guardrails).toContain("Never minimise");
    expect(draft.config.capabilities).toEqual([
      { kind: "peer", address: "safevoice/caseworker" },
    ]);
    expect(draft.reviewerQuestions).toEqual(["Is the tone right?"]);
  });
});
