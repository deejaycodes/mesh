import type { Address } from "./address.js";
import type { Message } from "./message.js";
import type { Peer } from "./peer.js";

/**
 * Address-based message routing across a set of Peers.
 *
 * Peers register themselves with their `address` as the key. `deliver()`
 * looks up the target peer and hands the message off via `peer.send()`.
 *
 * The registry is deliberately simple in Day 4:
 *   - In-process only. Multi-pod routing over Redis/Postgres is a later step.
 *   - Synchronous lookup. Peer.send() stays async for delivery semantics.
 *   - Throws UnknownPeerError if the address is not registered.
 *
 * Every Agent, every Human, every Channel becomes a Peer with an address,
 * and every message moves through this single interface.
 */
export class PeerRegistry {
  private peers = new Map<Address, Peer>();

  register(peer: Peer): void {
    this.peers.set(peer.address, peer);
  }

  unregister(address: Address): void {
    this.peers.delete(address);
  }

  get(address: Address): Peer | undefined {
    return this.peers.get(address);
  }

  has(address: Address): boolean {
    return this.peers.has(address);
  }

  async deliver(message: Message): Promise<void> {
    const peer = this.peers.get(message.to);
    if (!peer) throw new UnknownPeerError(message.to);
    await peer.send(message);
  }
}

export class UnknownPeerError extends Error {
  constructor(public readonly address: Address) {
    super(`Unknown peer: ${address}`);
    this.name = "UnknownPeerError";
  }
}
