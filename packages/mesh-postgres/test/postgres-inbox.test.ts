import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresInbox } from "../src/postgres-inbox.js";
import type { Message } from "@corelay/mesh-core";
import { startTestPostgres, type TestPostgres } from "./helpers/pg.js";

const msg = (id: string, to: `${string}/${string}`, content = "hi"): Message => ({
  id,
  from: "test/sender",
  to,
  kind: "peer",
  content,
  traceId: "trace-1",
  createdAt: Date.now(),
});

const waitUntil = async (predicate: () => boolean, timeoutMs = 5_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error("waitUntil timeout");
    await new Promise((r) => setTimeout(r, 50));
  }
};

describe("PostgresInbox (integration)", () => {
  let pg: TestPostgres;

  beforeAll(async () => {
    pg = await startTestPostgres();
  }, 120_000);

  afterAll(async () => {
    if (pg) await pg.stop();
  });

  it("persists appended messages and delivers them via consume", async () => {
    const inbox = new PostgresInbox({
      pool: pg.pool,
      address: "test/a",
      pollIntervalMs: 50,
    });
    const received: string[] = [];
    await inbox.consume(async (m) => {
      received.push(m.content);
    });

    await inbox.append(msg("m-1", "test/a", "first"));
    await inbox.append(msg("m-2", "test/a", "second"));

    await waitUntil(() => received.length === 2);
    await inbox.stop();

    expect(received).toEqual(["first", "second"]);
  });

  it("isolates messages by peer address", async () => {
    const inboxA = new PostgresInbox({
      pool: pg.pool,
      address: "test/iso-a",
      pollIntervalMs: 50,
    });
    const inboxB = new PostgresInbox({
      pool: pg.pool,
      address: "test/iso-b",
      pollIntervalMs: 50,
    });

    const receivedA: string[] = [];
    const receivedB: string[] = [];
    await inboxA.consume(async (m) => {
      receivedA.push(m.content);
    });
    await inboxB.consume(async (m) => {
      receivedB.push(m.content);
    });

    await inboxA.append(msg("iso-1", "test/iso-a", "to-a"));
    await inboxB.append(msg("iso-2", "test/iso-b", "to-b"));
    await inboxA.append(msg("iso-3", "test/iso-a", "to-a-again"));

    await waitUntil(() => receivedA.length === 2 && receivedB.length === 1);
    await inboxA.stop();
    await inboxB.stop();

    expect(receivedA).toEqual(["to-a", "to-a-again"]);
    expect(receivedB).toEqual(["to-b"]);
  });

  it("retries a failed message until a handler succeeds", async () => {
    const address = "test/retry";
    let attempts = 0;
    const inbox = new PostgresInbox({
      pool: pg.pool,
      address,
      pollIntervalMs: 50,
    });
    await inbox.consume(async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("boom");
    });

    await inbox.append(msg("retry-1", address));

    await waitUntil(() => attempts >= 3);
    await inbox.stop();

    expect(attempts).toBeGreaterThanOrEqual(3);

    // The row should now be marked consumed_at != null.
    const { rows } = await pg.pool.query<{ consumed_at: string | null }>(
      `SELECT consumed_at FROM inbox_messages WHERE id = $1`,
      ["retry-1"],
    );
    expect(rows[0]?.consumed_at).not.toBeNull();
  });

  it("is idempotent on append with the same id", async () => {
    const address = "test/idem";
    const inbox = new PostgresInbox({
      pool: pg.pool,
      address,
      pollIntervalMs: 50,
    });
    let count = 0;
    await inbox.consume(async () => {
      count += 1;
    });

    const m = msg("idem-1", address);
    await inbox.append(m);
    await inbox.append(m); // same id, should be a no-op
    await inbox.append(m);

    await waitUntil(() => count >= 1);
    // Give it time to deliver a second one if idempotency is broken.
    await new Promise((r) => setTimeout(r, 300));
    await inbox.stop();

    expect(count).toBe(1);
  });
});
