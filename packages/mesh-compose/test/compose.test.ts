import { describe, it, expect } from "vitest";
import { compose, approve, reject } from "../src/index.js";
import type { ComposeAuthor, ComposeSpec } from "../src/index.js";

const fakeAuthorOutput = JSON.stringify({
  name: "safevoice-triage",
  description: "First-contact triage for survivors.",
  prompt: "You are a trauma-informed first responder...",
  welcomeMessage: "You're safe to talk here. Tell me what's happening, in your own words.",
  reviewerQuestions: [
    "No child-safeguarding boundary was specified. Is that intentional?",
    "No backup human handler was named. What should happen on escalation timeout?",
  ],
});

const fakeAuthor = (output = fakeAuthorOutput): ComposeAuthor => ({
  draft: async () => output,
});

const baseSpec: ComposeSpec = {
  intent: "First-contact triage for survivors of domestic abuse on WhatsApp.",
  domain: ["safeguarding", "UK", "trauma-informed"],
  guardrails: [
    "Never minimise the survivor's experience.",
    "Never ask why they haven't left.",
  ],
  allowedPeers: ["safevoice/caseworker"],
};

describe("compose()", () => {
  it("drafts an AgentConfig from a spec", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.config.name).toBe("safevoice-triage");
    expect(draft.config.description).toContain("triage");
    expect(draft.config.prompt).toContain("trauma-informed");
    expect(draft.config.welcomeMessage).toContain("safe");
    expect(draft.config.tools).toEqual([]);
  });

  it("copies guardrails verbatim from the spec", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.config.guardrails).toContain("Never minimise");
    expect(draft.config.guardrails).toContain("Never ask why");
  });

  it("maps allowedPeers into PeerCapability entries", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.config.capabilities).toEqual([
      { kind: "peer", address: "safevoice/caseworker" },
    ]);
  });

  it("uses the specified model if given, otherwise gpt-4o-mini", async () => {
    const a = await compose(baseSpec, fakeAuthor());
    expect(a.config.model).toBe("gpt-4o-mini");
    expect(a.provenance.model).toBe("default");

    const b = await compose({ ...baseSpec, model: "claude-3-5-sonnet-20241022" }, fakeAuthor());
    expect(b.config.model).toBe("claude-3-5-sonnet-20241022");
    expect(b.provenance.model).toBe("user");
  });

  it("returns reviewer questions from the LLM", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.reviewerQuestions).toHaveLength(2);
    expect(draft.reviewerQuestions[0]).toContain("child-safeguarding");
  });

  it("preserves the raw LLM output for audit", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.rawLlmOutput).toBe(fakeAuthorOutput);
  });

  it("rejects an empty intent", async () => {
    await expect(compose({ intent: "" }, fakeAuthor())).rejects.toThrow("intent");
    await expect(compose({ intent: "   " }, fakeAuthor())).rejects.toThrow("intent");
  });

  it("rejects non-JSON author output with a clear error", async () => {
    const badAuthor: ComposeAuthor = { draft: async () => "not json at all" };
    await expect(compose(baseSpec, badAuthor)).rejects.toThrow("invalid JSON");
  });

  it("rejects author output missing required fields", async () => {
    const partial = JSON.stringify({ name: "only-name", prompt: "hi" });
    const author: ComposeAuthor = { draft: async () => partial };
    await expect(compose(baseSpec, author)).rejects.toThrow(/description|welcomeMessage|reviewerQuestions/);
  });

  it("accepts JSON wrapped in ```json fences (common LLM behaviour)", async () => {
    const fenced = "```json\n" + fakeAuthorOutput + "\n```";
    const draft = await compose(baseSpec, fakeAuthor(fenced));
    expect(draft.config.name).toBe("safevoice-triage");
  });

  it("tracks provenance for every AgentConfig field", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(draft.provenance.name).toBe("llm");
    expect(draft.provenance.prompt).toBe("llm");
    expect(draft.provenance.guardrails).toBe("user");
    expect(draft.provenance.capabilities).toBe("user");
    expect(draft.provenance.tools).toBe("default");
    expect(draft.provenance.maxResponseTokens).toBe("default");
  });

  it("marks guardrails as default when spec provides none", async () => {
    const minimalSpec: ComposeSpec = { intent: baseSpec.intent };
    const draft = await compose(minimalSpec, fakeAuthor());
    expect(draft.provenance.guardrails).toBe("default");
    expect(draft.config.guardrails).toBe("");
  });
});

describe("approve() and reject()", () => {
  it("approve() returns the draft config as an AgentConfig", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    const approved = approve(draft);
    expect(approved.name).toBe("safevoice-triage");
    expect(approved.prompt).toBeDefined();
  });

  it("approve() applies reviewer overrides", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    const approved = approve(draft, {
      prompt: "A better prompt the practitioner wrote themselves.",
      model: "gpt-4o",
    });
    expect(approved.prompt).toBe("A better prompt the practitioner wrote themselves.");
    expect(approved.model).toBe("gpt-4o");
    // Unchanged fields preserved
    expect(approved.name).toBe("safevoice-triage");
  });

  it("reject() is a no-op semantic hook (returns void)", async () => {
    const draft = await compose(baseSpec, fakeAuthor());
    expect(reject(draft, "prompt is too long")).toBeUndefined();
  });
});
