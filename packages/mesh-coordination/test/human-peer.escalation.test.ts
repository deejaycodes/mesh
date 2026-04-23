import { describe, it, expect } from "vitest";
import {
  MemoryInbox,
  PeerRegistry,
  type Address,
  type Message,
  type Peer,
} from "@corelay/mesh-core";
import { HumanPeer } from "../src/human-peer.js";

const sinkPeer = (address: Address): Peer & { received: Message[] } => ({
  address,
  received: [],
  async send(m) {
    (this as unknown as { received: Message[] }).received.push(m);
  },
});

const inbound = (sender: Address, to: Address, content: string, id = "m-1"): Message => ({
  id,
  from: sender,
  to,
  kind: "peer",
  content,
  traceId: "trace-1",
  createdAt: Date.now(),
});

const drain = async (ms = 0) =>
  new Promise((r) => setTimeout(r, ms));

describe("HumanPeer escalation", () => {
  it("delivers a rejection to the caller when no one responds in time", async () => {
    const registry = new PeerRegistry();
    const caller = sinkPeer("t/caller");
    registry.register(caller);

    const human = new HumanPeer({
      address: "t/caseworker/alice",
      inbox: new MemoryInbox(),
      registry,
      escalation: {
        timeoutMs: 30,
        onTimeout: "reject",
        reason: "Alice unavailable — please try again.",
      },
    });
    registry.register(human);
    await human.start();

    await human.send(inbound("t/caller", "t/caseworker/alice", "please approve", "m-1"));
    await drain(60);

    expect(caller.received).toHaveLength(1);
    expect(caller.received[0]?.content).toBe("Alice unavailable — please try again.");
    const meta = caller.received[0]?.metadata?.human as {
      decision: string;
      actor: string;
    };
    expect(meta.decision).toBe("reject");
    expect(meta.actor).toBe("system:escalation");
    expect(human.list()).toHaveLength(0);

    human.stop();
  });

  it("reassigns to the fallback address when onTimeout is reassign", async () => {
    const registry = new PeerRegistry();
    const caller = sinkPeer("t/caller");
    const manager = sinkPeer("t/caseworker/manager");
    registry.register(caller);
    registry.register(manager);

    const human = new HumanPeer({
      address: "t/caseworker/alice",
      inbox: new MemoryInbox(),
      registry,
      escalation: {
        timeoutMs: 30,
        onTimeout: "reassign",
        fallbackAddress: "t/caseworker/manager",
      },
    });
    registry.register(human);
    await human.start();

    await human.send(inbound("t/caller", "t/caseworker/alice", "complex case", "m-1"));
    await drain(60);

    expect(caller.received).toHaveLength(0);
    expect(manager.received).toHaveLength(1);
    expect(manager.received[0]?.content).toBe("complex case");
    expect(manager.received[0]?.to).toBe("t/caseworker/manager");
    expect(
      (manager.received[0]?.metadata?.human as { decision: string }).decision,
    ).toBe("reassign");

    human.stop();
  });

  it("does not escalate if the human responds before the timeout", async () => {
    const registry = new PeerRegistry();
    const caller = sinkPeer("t/caller");
    registry.register(caller);

    const human = new HumanPeer({
      address: "t/caseworker/alice",
      inbox: new MemoryInbox(),
      registry,
      escalation: { timeoutMs: 100, onTimeout: "reject" },
    });
    registry.register(human);
    await human.start();

    await human.send(inbound("t/caller", "t/caseworker/alice", "urgent", "m-1"));
    // small nudge so the inbox delivers the item.
    await drain(10);
    await human.respond("m-1", { decision: "approve", actor: "alice" });
    // Wait past the timeout — no escalation should happen.
    await drain(150);

    expect(caller.received).toHaveLength(1);
    expect(caller.received[0]?.content).toBe("urgent");
    expect(
      (caller.received[0]?.metadata?.human as { actor: string }).actor,
    ).toBe("alice");

    human.stop();
  });

  it("stop() cancels pending timers — no escalation fires after stop", async () => {
    const registry = new PeerRegistry();
    const caller = sinkPeer("t/caller");
    registry.register(caller);

    const human = new HumanPeer({
      address: "t/caseworker/alice",
      inbox: new MemoryInbox(),
      registry,
      escalation: { timeoutMs: 30, onTimeout: "reject" },
    });
    registry.register(human);
    await human.start();

    await human.send(inbound("t/caller", "t/caseworker/alice", "x", "m-1"));
    await drain(5);
    human.stop();
    await drain(60);

    expect(caller.received).toHaveLength(0);
  });
});
