import type { Pool } from "pg";
import type { Address, Message, Peer } from "@corelay/mesh-core";

/**
 * A PeerRegistry that routes messages across processes via Postgres.
 *
 * Local peers are delivered in-process (fast path). Messages to unknown
 * peers are written to the inbox_messages table — if the target peer is
 * running on another pod, its PostgresInbox will pick it up.
 *
 * This enables multi-pod deployments without Redis or a message broker.
 * Trade-off: cross-pod delivery has polling latency (default 250ms).
 *
 * Implements the same interface as mesh-core's PeerRegistry so it's a
 * drop-in replacement. Pass it anywhere a PeerRegistry is expected.
 */
export class DistributedPeerRegistry {
  private readonly peers = new Map<Address, Peer>();
  private readonly pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  register(peer: Peer): void {
    this.peers.set(peer.address, peer);
  }

  unregister(address: Address): void {
    this.peers.delete(address);
  }

  has(address: Address): boolean {
    return this.peers.has(address);
  }

  get(address: Address): Peer | undefined {
    return this.peers.get(address);
  }

  /**
   * Deliver a message. If the target is local, deliver in-process.
   * Otherwise, write to the inbox_messages table for cross-pod delivery.
   */
  async deliver(message: Message): Promise<void> {
    const localPeer = this.peers.get(message.to);
    if (localPeer) {
      await localPeer.send(message);
      return;
    }

    // Cross-pod: write to inbox for the target to pick up
    await this.pool.query(
      `INSERT INTO inbox_messages (id, peer_address, payload, created_at, retry_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (id) DO NOTHING`,
      [message.id, message.to, JSON.stringify(message), message.createdAt],
    );
  }
}
