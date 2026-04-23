import type { Message } from "./message.js";

/**
 * A durable, ordered queue of messages for a single Peer.
 *
 * Implementations include an in-memory inbox (for tests and single-process
 * demos) and a Postgres-backed inbox (for production).
 *
 * Guarantees:
 *   - `append` persists the message before returning.
 *   - `consume` invokes the handler at least once per appended message.
 *     Handlers must be idempotent keyed on `Message.id`.
 */
export interface Inbox {
  append(message: Message): Promise<void>;
  consume(handler: MessageHandler): Promise<void>;
}

export type MessageHandler = (message: Message) => Promise<void>;
