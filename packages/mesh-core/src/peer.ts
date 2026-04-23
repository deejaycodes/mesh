import type { Address } from "./address.js";
import type { Message } from "./message.js";

/**
 * A Peer is anything addressable in the Mesh — agents, humans, channels.
 *
 * Peers receive messages by having messages pushed to their address via a
 * PeerRegistry, and send messages by handing them to the same registry.
 * The runtime is intentionally agnostic about what a Peer does internally.
 */
export interface Peer {
  /** Stable address. Never changes over the Peer's lifetime. */
  readonly address: Address;
  /**
   * Deliver a message to this Peer. Implementations typically append to an
   * inbox and return immediately; actual processing happens asynchronously.
   */
  send(message: Message): Promise<void>;
}
