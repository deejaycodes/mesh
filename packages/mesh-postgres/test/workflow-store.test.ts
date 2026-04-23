import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkflowStore } from "../src/workflow-store.js";
import { startTestPostgres, type TestPostgres } from "./helpers/pg.js";

describe("WorkflowStore (integration)", () => {
  let pg: TestPostgres;
  let store: WorkflowStore;

  beforeAll(async () => {
    pg = await startTestPostgres();
    store = new WorkflowStore({ pool: pg.pool });
  }, 120_000);

  afterAll(async () => {
    if (pg) await pg.stop();
  });

  it("creates a workflow and reads it back", async () => {
    const wf = await store.createWorkflow("tenant/agent");

    expect(wf.rootPeer).toBe("tenant/agent");
    expect(wf.status).toBe("running");

    const loaded = await store.getWorkflow(wf.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.rootPeer).toBe("tenant/agent");
    expect(loaded?.status).toBe("running");
    expect(loaded?.startedAt).toBe(wf.startedAt);
  });

  it("appends events in order and returns them in order", async () => {
    const wf = await store.createWorkflow("tenant/agent");

    await store.appendEvent(wf.id, "llm_call_started", {
      kind: "llm_call_started",
      peer: "tenant/agent",
      model: "gpt-4o-mini",
    });
    await store.appendEvent(wf.id, "llm_call_completed", {
      kind: "llm_call_completed",
      peer: "tenant/agent",
      model: "gpt-4o-mini",
      content: "hello",
      totalTokens: 12,
    });
    await store.appendEvent(wf.id, "workflow_completed", {
      kind: "workflow_completed",
    });

    const events = await store.getEvents(wf.id);
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.kind)).toEqual([
      "llm_call_started",
      "llm_call_completed",
      "workflow_completed",
    ]);
  });

  it("updates status and error", async () => {
    const wf = await store.createWorkflow("tenant/agent");

    await store.updateStatus(wf.id, "failed", "provider outage");

    const loaded = await store.getWorkflow(wf.id);
    expect(loaded?.status).toBe("failed");
    expect(loaded?.error).toBe("provider outage");
  });

  it("returns null for an unknown workflow id", async () => {
    const loaded = await store.getWorkflow("00000000-0000-0000-0000-000000000000");
    expect(loaded).toBeNull();
  });
});
