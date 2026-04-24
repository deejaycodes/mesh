/**
 * Integration test: Compose → Agent → Eval
 *
 * Proves the full Q1 deploy story end-to-end:
 * 1. Compose drafts an AgentConfig from a spec (mock LLM).
 * 2. A reviewer approves the draft.
 * 3. An Agent is instantiated from the approved config.
 * 4. An eval suite runs against the agent.
 * 5. The gate decision determines whether the deploy proceeds.
 */
import { describe, it, expect } from "vitest";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  run,
  type LLMClient,
  type LLMRequest,
  type LLMResponse,
} from "@corelay/mesh-core";
import { compose, approve, type ComposeAuthor } from "../src/index.js";

// Inline a minimal eval runner — we can't import mesh-eval as a dep
// (it's a sibling package, not a dependency of mesh-compose). Instead
// we replicate the core contract: run each case, check assertions.
interface MiniEvalCase {
  id: string;
  input: string;
  assertions: Array<
    | { kind: "contains"; value: string }
    | { kind: "notContains"; value: string }
  >;
}

const miniEval = async (
  cases: MiniEvalCase[],
  target: (input: string) => Promise<string>,
): Promise<{ passed: number; failed: number; total: number }> => {
  let passed = 0;
  let failed = 0;
  for (const c of cases) {
    const reply = await target(c.input);
    const ok = c.assertions.every((a) => {
      const hay = reply.toLowerCase();
      const needle = a.value.toLowerCase();
      return a.kind === "contains" ? hay.includes(needle) : !hay.includes(needle);
    });
    if (ok) passed++;
    else failed++;
  }
  return { passed, failed, total: cases.length };
};

// --- Mock LLM that echoes the system prompt's first word + user content ---
class EchoLLM implements LLMClient {
  readonly name = "echo";
  async chat(request: LLMRequest): Promise<LLMResponse> {
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const user = request.messages.find((m) => m.role === "user")?.content ?? "";
    const firstWord = system.split(/\s+/)[0] ?? "";
    return {
      content: `[${firstWord}] safe here. ${user}`,
      model: request.model,
      toolCalls: [],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    };
  }
}

// --- Mock Compose author ---
const fakeAuthor: ComposeAuthor = {
  draft: async () =>
    JSON.stringify({
      name: "safevoice-triage",
      description: "First-contact triage for survivors.",
      prompt: "You are a trauma-informed first responder. Never minimise.",
      welcomeMessage: "You're safe to talk here.",
      reviewerQuestions: ["Is the child-safeguarding boundary covered?"],
    }),
};

const CALLER = "test/caller" as const;

describe("Compose → Agent → Eval integration", () => {
  it("drafts, approves, runs, and gates a deploy", async () => {
    // 1. Compose drafts
    const draft = await compose(
      {
        intent: "First-contact triage for survivors of domestic abuse.",
        guardrails: ["Never minimise.", "Never ask why they haven't left."],
        allowedPeers: [CALLER],
      },
      fakeAuthor,
    );
    expect(draft.config.name).toBe("safevoice-triage");
    expect(draft.reviewerQuestions.length).toBeGreaterThan(0);

    // 2. Reviewer approves (with one override)
    const config = approve(draft, { model: "gpt-4o-mini" });
    expect(config.prompt).toContain("trauma-informed");

    // 3. Instantiate Agent from approved config
    const registry = new PeerRegistry();
    const agent = new Agent(
      "safevoice/triage",
      config,
      new EchoLLM(),
      new MemoryInbox(),
      registry,
    );
    registry.register(agent);
    await agent.start();

    // 4. Run eval suite against the live agent
    const evalCases: MiniEvalCase[] = [
      {
        id: "greets-safely",
        input: "hi",
        assertions: [{ kind: "contains", value: "safe" }],
      },
      {
        id: "no-blame",
        input: "he hit me",
        assertions: [{ kind: "notContains", value: "why haven't you left" }],
      },
    ];

    const target = async (input: string): Promise<string> => {
      const result = await run(registry, "safevoice/triage", input, {
        from: CALLER,
        timeoutMs: 5_000,
      });
      return result.content;
    };

    const report = await miniEval(evalCases, target);

    // 5. Gate decision
    expect(report.passed).toBe(2);
    expect(report.failed).toBe(0);
    const gatePassed = report.failed === 0;
    expect(gatePassed).toBe(true);
  });
});
