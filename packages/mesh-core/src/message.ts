import type { Address } from "./address.js";

/**
 * The message envelope passed between Peers.
 *
 * Messages are the only way Peers communicate. A message carries one piece of
 * content from one Peer to another, stamped with a trace id so the full
 * conversation can be reconstructed.
 */
export interface Message {
  /** Stable unique id. Used for idempotency (at-least-once delivery). */
  id: string;
  /** Sender's address. */
  from: Address;
  /** Recipient's address. */
  to: Address;
  /** What this message represents at the protocol level. */
  kind: MessageKind;
  /** The text content. Structured payloads go in `metadata`. */
  content: string;
  /** Trace id shared across every message in a single agent run. */
  traceId: string;
  /** Epoch millis when the message was created. */
  createdAt: number;
  /** Optional typed metadata. Runtime does not inspect. */
  metadata?: Record<string, unknown>;
}

export type MessageKind =
  | "user"       // from a human user (inbound)
  | "assistant"  // from an agent (outbound)
  | "tool"       // a tool call result
  | "system"     // runtime-injected system instruction
  | "peer";      // peer-to-peer (agent-to-agent or agent-to-human)
