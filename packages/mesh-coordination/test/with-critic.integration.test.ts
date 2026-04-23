import { describe, it, expect } from "vitest";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  type AgentConfig,
  type LLMClient,
  type LLMRequest,
  type LLMResponse,
  type Message,
  type Peer,
} from "@corelay/mesh-core";
import { Critic } from "../src/critic.js";
import { withCritic } from "../src/with-critic.js";

/**
 * The Agent and the Critic share one LLM in these tests. We drive its
 * responses from an array keyed on which part of the prompt is present —
 * this keeps the test deterministic without giving each party its own stub.
 */
class FlexibleLLM implements LLMClient {
  readonly name = "flex";
  public readonly requests: LLMRequest[] = [];

  constructor(
    private readonly handler: (request: LLMRequest) => string,
  ) {}

  async chat(request: LLMRequest): Promise<LLMResponse> {
    this.requests.push(request);
    return {
      content: this.handler(request),
      model: request.model,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  }
}

const sinkPeer = (address: `${string}/${string}`): Peer & { received: Message[] } => ({
  address,
  received: [],
  async send(m) {
    (this as unknown as { received: Message[] }).received.push(m);
  },
});

const drain = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

describe("withCritic + Agent (integration)", () => {
  it("critiques an agent's reply, revises it, and forwards the revision to the real recipient", async () => {
    const registry = new PeerRegistry();
    const final = sinkPeer("safevoice/handoff");
    registry.register(final);

    const llm = new FlexibleLLM((request) => {
      const system = request.messages[0]?.content ?? "";
      const lastUser = request.messages[request.messages.length - 1]?.content ?? "";

      if (system.startsWith("You are a quality critic")) {
        return "REVISE: never ask for full bank account numbers; request sort code + last four digits only.";
      }

      // Any request with the agent's system prompt. Distinguish the revise
      // pass (which includes the reviewer's feedback in the last user
      // message) from the initial draft.
      if (lastUser.includes("A quality reviewer found this issue")) {
        return "You're eligible for support. I'll only need your sort code and the last four digits of your account number to proceed safely.";
      }

      return "Yes you qualify. Please share your full bank account number so we can enrol you immediately.";
    });

    const criticPeerAddress = "safevoice/critic-for-handoff" as const;
    const handoffAddress = "safevoice/handoff" as const;
    const callerAddress = "safevoice/triage-agent" as const;

    const agentConfig: AgentConfig = {
      name: "triage",
      description: "SafeVoice triage agent",
      prompt: "You are SafeVoice's triage agent. Be warm, concise, and safety-first.",
      model: "gpt-4o-mini",
      maxResponseTokens: 300,
      welcomeMessage: "",
      guardrails: "",
      tools: [],
      // The agent addresses the critic-peer, not the real handoff.
      capabilities: [{ kind: "peer", address: criticPeerAddress }],
    };

    const agent = new Agent(callerAddress, agentConfig, llm, new MemoryInbox(), registry);
    registry.register(agent);
    await agent.start();

    const critic = new Critic({
      llm,
      model: "gpt-4o-mini",
      domain: "safeguarding triage",
      maxCycles: 2,
    });

    const criticPeer = withCritic({
      address: criticPeerAddress,
      forwardTo: handoffAddress,
      critic,
      systemPrompt: agentConfig.prompt,
      registry,
    });
    registry.register(criticPeer);

    // A user asks the triage agent a question; the reply would be directed
    // to the critic-peer (because that's the agent's only peer capability),
    // which critiques, revises, and forwards the revised message to the
    // real handoff address.
    await agent.send({
      id: "inbound-1",
      from: criticPeerAddress,
      to: callerAddress,
      kind: "user",
      content: "Do I qualify for the support scheme?",
      traceId: "t-1",
      createdAt: 0,
    });

    await drain();

    expect(final.received).toHaveLength(1);
    const delivered = final.received[0];
    expect(delivered?.content).toMatch(/sort code/);
    expect(delivered?.content).not.toMatch(/full bank account/);
    expect(delivered?.to).toBe(handoffAddress);

    const meta = delivered?.metadata?.critic as { revised: boolean; cycles: number } | undefined;
    expect(meta?.revised).toBe(true);
    expect(meta?.cycles).toBeGreaterThanOrEqual(1);
  });

  it("forwards unchanged when the critic approves on first cycle", async () => {
    const registry = new PeerRegistry();
    const final = sinkPeer("safevoice/handoff");
    registry.register(final);

    const approvedReply =
      "Thanks for reaching out. You may qualify. I'll signpost you to the National Helpline on 0808 2000 247.";

    const llm = new FlexibleLLM((request) => {
      const system = request.messages[0]?.content ?? "";
      if (system.startsWith("You are SafeVoice's triage agent")) return approvedReply;
      return "APPROVED";
    });

    const criticPeerAddress = "safevoice/critic-for-handoff" as const;
    const handoffAddress = "safevoice/handoff" as const;
    const callerAddress = "safevoice/triage-agent" as const;

    const agentConfig: AgentConfig = {
      name: "triage",
      description: "",
      prompt: "You are SafeVoice's triage agent. Be warm, concise, and safety-first.",
      model: "gpt-4o-mini",
      maxResponseTokens: 300,
      welcomeMessage: "",
      guardrails: "",
      tools: [],
      capabilities: [{ kind: "peer", address: criticPeerAddress }],
    };

    const agent = new Agent(callerAddress, agentConfig, llm, new MemoryInbox(), registry);
    registry.register(agent);
    await agent.start();

    const critic = new Critic({ llm, model: "gpt-4o-mini", domain: "safeguarding triage" });

    registry.register(
      withCritic({
        address: criticPeerAddress,
        forwardTo: handoffAddress,
        critic,
        systemPrompt: agentConfig.prompt,
        registry,
      }),
    );

    await agent.send({
      id: "inbound-2",
      from: criticPeerAddress,
      to: callerAddress,
      kind: "user",
      content: "Do I qualify for the support scheme?",
      traceId: "t-2",
      createdAt: 0,
    });

    await drain();

    expect(final.received).toHaveLength(1);
    expect(final.received[0]?.content).toBe(approvedReply);
    const meta = final.received[0]?.metadata?.critic as { revised: boolean } | undefined;
    expect(meta?.revised).toBe(false);
  });
});
