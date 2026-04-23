import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  run,
  type AgentConfig,
  type LLMClient,
} from "@corelay/mesh-core";
import { WorkflowStore } from "../src/workflow-store.js";
import { startTestPostgres, type TestPostgres } from "./helpers/pg.js";

const echoLLM: LLMClient = {
  name: "mock",
  async chat(req) {
    const lastUser = [...req.messages].reverse().find((m) => m.role === "user");
    return {
      content: `echo: ${lastUser?.content ?? ""}`,
      model: req.model,
      toolCalls: [],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    };
  },
};

const agentConfig: AgentConfig = {
  name: "hello",
  description: "",
  prompt: "You are helpful.",
  model: "gpt-4o-mini",
  maxResponseTokens: 100,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [{ kind: "peer", address: "demo/caller" }],
};

describe("run() + WorkflowStore (integration)", () => {
  let pg: TestPostgres;
  let store: WorkflowStore;

  beforeAll(async () => {
    pg = await startTestPostgres();
    store = new WorkflowStore({ pool: pg.pool });
  }, 120_000);

  afterAll(async () => {
    if (pg) await pg.stop();
  });

  it("persists the workflow and its events, marks completed", async () => {
    const registry = new PeerRegistry();
    const agent = new Agent("demo/hello", agentConfig, echoLLM, new MemoryInbox(), registry);
    registry.register(agent);
    await agent.start();

    const result = await run(registry, "demo/hello", "hi there", {
      from: "demo/caller",
      recorder: store,
      timeoutMs: 5_000,
    });

    expect(result.content).toBe("echo: hi there");
    expect(result.workflowId).toBeDefined();

    const workflow = await store.getWorkflow(result.workflowId!);
    expect(workflow).not.toBeNull();
    expect(workflow?.status).toBe("completed");
    expect(workflow?.rootPeer).toBe("demo/hello");

    const events = await store.getEvents(result.workflowId!);
    expect(events.map((e) => e.kind)).toEqual([
      "message_sent",
      "message_delivered",
    ]);
  });
});
