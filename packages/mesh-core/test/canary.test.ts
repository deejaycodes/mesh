import { describe, it, expect, vi } from "vitest";
import { canaryPeer } from "../src/canary.js";
import { PeerRegistry } from "../src/peer-registry.js";
import type { Message, Peer } from "../src/peer.js";
import type { Address } from "../src/address.js";

const makePeer = (address: string): { peer: Peer; received: Message[] } => {
  const received: Message[] = [];
  const peer: Peer = {
    address: address as Address,
    send: async (msg) => { received.push(msg); },
  };
  return { peer, received };
};

const makeMessage = (to: string): Message => ({
  id: "m1",
  from: "test/user" as Address,
  to: to as Address,
  kind: "user",
  content: "hello",
  traceId: "t1",
  createdAt: Date.now(),
});

describe("canaryPeer", () => {
  it("shadow mode (0%): delivers to live address", async () => {
    const registry = new PeerRegistry();
    const { peer: live, received: liveRx } = makePeer("agent/live");
    const { peer: cand, received: candRx } = makePeer("agent/candidate");
    registry.register(live);
    registry.register(cand);

    const onShadow = vi.fn();
    const canary = canaryPeer({
      liveAddress: "agent/live" as Address,
      candidateAddress: "agent/candidate" as Address,
      canaryPercent: 0,
      registry,
      onShadow,
    });

    await canary.send(makeMessage(canary.address));

    // Both received the message (shadow mode)
    expect(liveRx).toHaveLength(1);
    expect(candRx).toHaveLength(1);
    expect(onShadow).toHaveBeenCalledOnce();
  });

  it("full rollout (100%): delivers only to candidate", async () => {
    const registry = new PeerRegistry();
    const { peer: live, received: liveRx } = makePeer("agent/live");
    const { peer: cand, received: candRx } = makePeer("agent/candidate");
    registry.register(live);
    registry.register(cand);

    const canary = canaryPeer({
      liveAddress: "agent/live" as Address,
      candidateAddress: "agent/candidate" as Address,
      canaryPercent: 100,
      registry,
    });

    await canary.send(makeMessage(canary.address));

    expect(liveRx).toHaveLength(0);
    expect(candRx).toHaveLength(1);
  });

  it("canary mode (50%): routes to one of the two", async () => {
    const registry = new PeerRegistry();
    const { peer: live, received: liveRx } = makePeer("agent/live");
    const { peer: cand, received: candRx } = makePeer("agent/candidate");
    registry.register(live);
    registry.register(cand);

    const canary = canaryPeer({
      liveAddress: "agent/live" as Address,
      candidateAddress: "agent/candidate" as Address,
      canaryPercent: 50,
      registry,
    });

    // Send 20 messages — statistically both should receive some
    for (let i = 0; i < 20; i++) {
      await canary.send(makeMessage(canary.address));
    }

    expect(liveRx.length + candRx.length).toBe(20);
    // With 50% and 20 messages, extremely unlikely either gets 0
    expect(liveRx.length).toBeGreaterThan(0);
    expect(candRx.length).toBeGreaterThan(0);
  });

  it("has a canary/ prefixed address", () => {
    const registry = new PeerRegistry();
    const canary = canaryPeer({
      liveAddress: "agent/live" as Address,
      candidateAddress: "agent/candidate" as Address,
      canaryPercent: 0,
      registry,
    });
    expect(canary.address).toBe("canary/agent/live");
  });
});
