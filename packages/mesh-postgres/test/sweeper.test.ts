import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WorkflowStore } from "../src/workflow-store.js";
import { sweepStaleWorkflows } from "../src/sweeper.js";
import { startTestPostgres, type TestPostgres } from "./helpers/pg.js";

const ageWorkflow = async (pg: TestPostgres, id: string, updatedAt: number) => {
  await pg.pool.query(
    `UPDATE workflows SET updated_at = $1 WHERE id = $2`,
    [updatedAt, id],
  );
};

describe("sweepStaleWorkflows (integration)", () => {
  let pg: TestPostgres;
  let store: WorkflowStore;

  beforeAll(async () => {
    pg = await startTestPostgres();
    store = new WorkflowStore({ pool: pg.pool });
  }, 120_000);

  afterAll(async () => {
    if (pg) await pg.stop();
  });

  it("marks stale running workflows as failed with the configured reason", async () => {
    const fresh = await store.createWorkflow("t/agent-fresh");
    const stale = await store.createWorkflow("t/agent-stale");

    // Age the stale one to 10 minutes ago.
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    await ageWorkflow(pg, stale.id, tenMinAgo);

    const { swept } = await sweepStaleWorkflows({
      pool: pg.pool,
      olderThanMs: 5 * 60 * 1000,
      reason: "Pod crashed — sweeper reconciled.",
    });

    expect(swept).toBe(1);

    const swept_wf = await store.getWorkflow(stale.id);
    expect(swept_wf?.status).toBe("failed");
    expect(swept_wf?.error).toBe("Pod crashed — sweeper reconciled.");

    const fresh_wf = await store.getWorkflow(fresh.id);
    expect(fresh_wf?.status).toBe("running");
    expect(fresh_wf?.error).toBeUndefined();
  });

  it("leaves completed and failed workflows alone", async () => {
    const completed = await store.createWorkflow("t/agent-completed");
    const alreadyFailed = await store.createWorkflow("t/agent-failed");

    await store.updateStatus(completed.id, "completed");
    await store.updateStatus(alreadyFailed.id, "failed", "original error");

    // Age both to ensure they'd be candidates if status weren't 'running'.
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    await ageWorkflow(pg, completed.id, tenMinAgo);
    await ageWorkflow(pg, alreadyFailed.id, tenMinAgo);

    await sweepStaleWorkflows({ pool: pg.pool, olderThanMs: 5 * 60 * 1000 });

    const comp = await store.getWorkflow(completed.id);
    const failed = await store.getWorkflow(alreadyFailed.id);

    expect(comp?.status).toBe("completed");
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toBe("original error"); // not overwritten
  });

  it("respects the limit per call", async () => {
    const created = [];
    for (let i = 0; i < 5; i++) {
      created.push(await store.createWorkflow(`t/agent-limit-${i}`));
    }

    // Age all five.
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    for (const wf of created) {
      await ageWorkflow(pg, wf.id, tenMinAgo);
    }

    const first = await sweepStaleWorkflows({
      pool: pg.pool,
      olderThanMs: 5 * 60 * 1000,
      limit: 2,
    });
    const second = await sweepStaleWorkflows({
      pool: pg.pool,
      olderThanMs: 5 * 60 * 1000,
      limit: 2,
    });
    const third = await sweepStaleWorkflows({
      pool: pg.pool,
      olderThanMs: 5 * 60 * 1000,
      limit: 10,
    });

    expect(first.swept).toBe(2);
    expect(second.swept).toBe(2);
    expect(third.swept).toBe(1);
  });

  it("does not sweep when no workflows are past the threshold", async () => {
    const wf = await store.createWorkflow("t/agent-no-sweep");
    // updated_at is now; any olderThanMs > 0 should leave it alone.

    const { swept } = await sweepStaleWorkflows({
      pool: pg.pool,
      olderThanMs: 60 * 60 * 1000, // 1 hour
    });

    expect(swept).toBe(0);
    const loaded = await store.getWorkflow(wf.id);
    expect(loaded?.status).toBe("running");
  });
});
