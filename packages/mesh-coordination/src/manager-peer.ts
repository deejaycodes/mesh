import type {
  Address,
  Message,
  Peer,
  PeerRegistry,
} from "@corelay/mesh-core";
import type { Hierarchy } from "./hierarchy.js";

export interface ManagerPeerConfig {
  /** The address this manager-peer answers to. */
  address: Address;
  /** The Hierarchy engine that decomposes/dispatches/merges. */
  hierarchy: Hierarchy;
  /** Address the manager's final answer is delivered to. */
  forwardTo: Address;
  /** Registry to forward the merged answer through. */
  registry: PeerRegistry;
}

/**
 * A Peer that, on receiving a message, runs Hierarchy against its workers
 * and forwards the merged answer to `forwardTo`.
 *
 * The caller (upstream agent or channel) addresses the manager-peer; it
 * never knows how many workers ran, how replies were merged, or which
 * workers timed out — those details are captured in the forwarded
 * message's `metadata.hierarchy` payload for traces.
 */
export const managerPeer = (config: ManagerPeerConfig): Peer => ({
  address: config.address,
  async send(message: Message) {
    const result = await config.hierarchy.run({
      userMessage: message.content,
      from: config.address,
    });

    const forwarded: Message = {
      id: `${message.id}-merged`,
      from: config.address,
      to: config.forwardTo,
      kind: "assistant",
      content: result.content,
      traceId: message.traceId,
      createdAt: Date.now(),
      metadata: {
        ...(message.metadata ?? {}),
        hierarchy: {
          contributions: result.contributions.map((c) => ({
            address: c.worker.address,
            role: c.worker.role,
          })),
          missed: result.missed.map((m) => ({
            address: m.worker.address,
            role: m.worker.role,
            reason: m.reason,
          })),
        },
      },
    };

    await config.registry.deliver(forwarded);
  },
});
