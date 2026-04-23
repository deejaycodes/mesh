import { describe, it, expect } from "vitest";
import { Agent } from "../src/agent.js";
import { MemoryInbox } from "../src/memory-inbox.js";
import { PeerRegistry } from "../src/peer-registry.js";
import { run } from "../src/run.js";
import type { AgentConfig } from "../src/agent-config.js";
import type { LLMClient } from "../src/llm.js";
import type {
  Workflow,
  WorkflowEvent,
  WorkflowEventData,
  WorkflowEventKind,
  WorkflowStatus,
} from "../src/workflow.js";
import type { WorkflowRecorder } from "../src/workflow-recorder.js";
import type { Address } from "../src/address.js";

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

class FakeRecorder implements WorkflowRecorder {
  public workflows: Workflow[] = [];
  public events: WorkflowEvent[] = [];
  public statusUpdates: Array<{ id: string; status: WorkflowStatus; error?: string }> = [];

  async createWorkflow(rootPeer: Address): Promise<Workflow> {
    const wf: Workflow = {
      id: `wf-${this.workflows.length + 1}`,
      rootPeer,
      status: "running",
      startedAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.workflows.push(wf);
    return wf;
  }

  async appendEvent(
    workflowId: string,
    kind: WorkflowEventKind,
    data: WorkflowEventData,
  ): Promise<WorkflowEvent> {
    const event: WorkflowEvent = {
      id: `e-${this.events.length + 1}`,
      workflowId,
      kind,
      at: Date.now(),
      data,
    };
    this.events.push(event);
    return event;
  }

  async updateStatus(id: string, status: WorkflowStatus, error?: string): Promise<void> {
    this.statusUpdates.push({ id, status, ...(error !== undefined && { error }) });
  }
}

const agentConfigFor = (caller: Address): AgentConfig => ({
  name: "hello",
  description: "",
  prompt: "You are helpful.",
  model: "gpt-4o-mini",
  maxResponseTokens: 100,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [{ kind: "peer", address: caller }],
});

describe("run() with WorkflowRecorder", () => {
  it("records createWorkflow, message_sent, message_delivered, completed", async () => {
    const registry = new PeerRegistry();
    const caller: Address = "demo/caller";
    const agent = new Agent(
      "demo/hello",
      agentConfigFor(caller),
      echoLLM,
      new MemoryInbox(),
      registry,
    );
    registry.register(agent);
    await agent.start();

    const recorder = new FakeRecorder();
    const result = await run(registry, "demo/hello", "ping", {
      from: caller,
      timeoutMs: 2_000,
      recorder,
    });

    expect(result.content).toBe("echo: ping");
    expect(result.workflowId).toBe("wf-1");

    expect(recorder.workflows).toHaveLength(1);
    expect(recorder.workflows[0]?.rootPeer).toBe("demo/hello");

    const kinds = recorder.events.map((e) => e.kind);
    expect(kinds).toEqual(["message_sent", "message_delivered"]);

    expect(recorder.statusUpdates).toEqual([
      { id: "wf-1", status: "completed" },
    ]);
  });

  it("marks the workflow failed on timeout", async () => {
    const registry = new PeerRegistry();
    registry.register({
      address: "demo/silent",
      async send() {
        // Never reply.
      },
    });

    const recorder = new FakeRecorder();
    await expect(
      run(registry, "demo/silent", "hi", { timeoutMs: 100, recorder }),
    ).rejects.toThrow(/timed out/i);

    expect(recorder.statusUpdates).toHaveLength(1);
    expect(recorder.statusUpdates[0]?.status).toBe("failed");
    expect(recorder.statusUpdates[0]?.error).toMatch(/timed out/i);
  });

  it("is a no-op when no recorder is supplied", async () => {
    const registry = new PeerRegistry();
    const caller: Address = "demo/caller";
    const agent = new Agent(
      "demo/hello",
      agentConfigFor(caller),
      echoLLM,
      new MemoryInbox(),
      registry,
    );
    registry.register(agent);
    await agent.start();

    const result = await run(registry, "demo/hello", "ping", {
      from: caller,
      timeoutMs: 2_000,
    });

    expect(result.content).toBe("echo: ping");
    expect(result.workflowId).toBeUndefined();
  });
});
