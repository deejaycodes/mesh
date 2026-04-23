import { describe, it, expect } from "vitest";
import { PeerRegistry, UnknownPeerError } from "../src/peer-registry.js";
import type { Peer } from "../src/peer.js";
import type { Message } from "../src/message.js";

const mkPeer = (address: `${string}/${string}`): Peer & { received: Message[] } => ({
  address,
  received: [],
  async send(m) {
    (this as unknown as { received: Message[] }).received.push(m);
  },
});

const msg = (to: `${string}/${string}`): Message => ({
  id: "m-1",
  from: "test/sender",
  to,
  kind: "peer",
  content: "hi",
  traceId: "t-1",
  createdAt: 0,
});

describe("PeerRegistry", () => {
  it("delivers a message to the registered peer", async () => {
    const registry = new PeerRegistry();
    const peer = mkPeer("test/alice");
    registry.register(peer);

    await registry.deliver(msg("test/alice"));

    expect(peer.received).toHaveLength(1);
    expect(peer.received[0]?.to).toBe("test/alice");
  });

  it("throws UnknownPeerError when the target is not registered", async () => {
    const registry = new PeerRegistry();
    await expect(registry.deliver(msg("test/nobody"))).rejects.toBeInstanceOf(UnknownPeerError);
  });

  it("supports unregister", async () => {
    const registry = new PeerRegistry();
    const peer = mkPeer("test/alice");
    registry.register(peer);
    registry.unregister("test/alice");

    expect(registry.has("test/alice")).toBe(false);
    await expect(registry.deliver(msg("test/alice"))).rejects.toBeInstanceOf(UnknownPeerError);
  });

  it("routes independently to multiple peers", async () => {
    const registry = new PeerRegistry();
    const a = mkPeer("test/alice");
    const b = mkPeer("test/bob");
    registry.register(a);
    registry.register(b);

    await registry.deliver(msg("test/alice"));
    await registry.deliver(msg("test/bob"));
    await registry.deliver(msg("test/alice"));

    expect(a.received).toHaveLength(2);
    expect(b.received).toHaveLength(1);
  });
});
