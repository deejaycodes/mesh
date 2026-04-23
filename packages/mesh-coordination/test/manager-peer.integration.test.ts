import { describe, it, expect } from "vitest";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  type AgentConfig,
  type Address,
  type LLMClient,
  type Message,
  type Peer,
} from "@corelay/mesh-core";
import {
  Hierarchy,
  type HierarchyWorker,
  type ResultMerger,
  type TaskDecomposer,
} from "../src/hierarchy.js";
import { managerPeer } from "../src/manager-peer.js";

/**
 * Each worker is a real @corelay/mesh-core Agent that echoes the incoming
 * task with its own role prefix. This exercises the full end-to-end shape:
 *
 *   upstream caller → manager-peer → hierarchy → worker agents (LLM calls)
 *                  ← merged reply ← collector ← each worker's reply
 *
 * The LLM stub dispatches by the agent's system prompt so each worker's
 * output is predictable without ad-hoc branching.
 */

const workerLLM = (): LLMClient => ({
  name: "workers",
  async chat(req) {
    const system = req.messages.find((m) => m.role === "system")?.content ?? "";
    const user = req.messages.find((m) => m.role === "user")?.content ?? "";
    const role = system.replace(/^You are /, "").replace(/\.$/, "");
    return {
      content: `${role} handled: ${user}`,
      model: req.model,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  },
});

const workerConfig = (
  prompt: string,
  reportTo: Address,
): AgentConfig => ({
  name: prompt,
  description: "",
  prompt,
  model: "gpt-4o-mini",
  maxResponseTokens: 200,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [{ kind: "peer", address: reportTo }],
});

const triageWorker: HierarchyWorker = { address: "t/triage", role: "triage" };
const plannerWorker: HierarchyWorker = { address: "t/planner", role: "planner" };

const scripted: TaskDecomposer = {
  async decompose() {
    return new Map<Address, string>([
      ["t/triage", "assess immediate safety"],
      ["t/planner", "draft a safety plan"],
    ]);
  },
};

const labelMerger: ResultMerger = {
  async merge({ results }) {
    return results.map((r) => `${r.worker.role} → ${r.reply}`).join("\n");
  },
};

const sinkPeer = (address: Address): Peer & { received: Message[] } => ({
  address,
  received: [],
  async send(m) {
    (this as unknown as { received: Message[] }).received.push(m);
  },
});

const drain = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
};

describe("managerPeer + Hierarchy (integration)", () => {
  it("dispatches to worker agents, merges their replies, and forwards the result", async () => {
    const registry = new PeerRegistry();

    const collectorAddress: Address = "t/manager-collector";
    const managerAddress: Address = "t/manager";
    const finalAddress: Address = "t/final";

    const triageAgent = new Agent(
      triageWorker.address,
      workerConfig("You are the triage specialist.", collectorAddress),
      workerLLM(),
      new MemoryInbox(),
      registry,
    );
    const plannerAgent = new Agent(
      plannerWorker.address,
      workerConfig("You are the safety planner.", collectorAddress),
      workerLLM(),
      new MemoryInbox(),
      registry,
    );
    registry.register(triageAgent);
    registry.register(plannerAgent);
    await triageAgent.start();
    await plannerAgent.start();

    const finalSink = sinkPeer(finalAddress);
    registry.register(finalSink);

    const hierarchy = new Hierarchy({
      workers: [triageWorker, plannerWorker],
      registry,
      decomposer: scripted,
      merger: labelMerger,
      traceId: "t-1",
      collectorAddress,
      timeoutMs: 2_000,
    });

    registry.register(
      managerPeer({
        address: managerAddress,
        hierarchy,
        forwardTo: finalAddress,
        registry,
      }),
    );

    // Upstream caller: deliver a message addressed to the manager.
    await registry.deliver({
      id: "inbound-1",
      from: "t/caller",
      to: managerAddress,
      kind: "user",
      content: "Help me, I'm in danger.",
      traceId: "t-1",
      createdAt: 0,
    });

    await drain();

    expect(finalSink.received).toHaveLength(1);
    const delivered = finalSink.received[0];

    expect(delivered?.content).toContain("triage → the triage specialist handled");
    expect(delivered?.content).toContain("planner → the safety planner handled");
    expect(delivered?.to).toBe(finalAddress);
    expect(delivered?.from).toBe(managerAddress);

    const meta = delivered?.metadata?.hierarchy as {
      contributions: Array<{ address: string; role: string }>;
      missed: Array<{ address: string }>;
    } | undefined;

    expect(meta?.contributions.map((c) => c.address).sort()).toEqual([
      "t/planner",
      "t/triage",
    ]);
    expect(meta?.missed).toEqual([]);
  });
});
