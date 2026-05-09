import type { Inbox, MessageHandler } from "./inbox.js";
import type { Message } from "./message.js";

/**
 * In-memory Inbox implementation.
 *
 * Used for tests, single-process demos, and the first example agent.
 * Production deployments use PostgresInbox (separate package).
 *
 * Guarantees:
 *   - Messages are delivered in append order.
 *   - Handler exceptions are caught so they can't deadlock the queue.
 *   - Only one handler is active at a time; calling consume() twice
 *     replaces the previous handler.
 *   - Backpressure: rejects appends when queue exceeds maxSize.
 */
export class MemoryInbox implements Inbox {
  private queue: Message[] = [];
  private handler?: MessageHandler;
  private draining = false;
  private readonly maxSize: number;

  constructor(maxSize = 10_000) {
    this.maxSize = maxSize;
  }

  async append(message: Message): Promise<void> {
    if (this.queue.length >= this.maxSize) {
      throw new Error(`MemoryInbox: backpressure — queue full (${this.maxSize} messages). Message ${message.id} rejected.`);
    }
    this.queue.push(message);
    if (this.handler && !this.draining) void this.drain();
  }

  async consume(handler: MessageHandler): Promise<void> {
    this.handler = handler;
    if (this.queue.length > 0 && !this.draining) void this.drain();
  }

  /** Number of messages currently queued. */
  get size(): number {
    return this.queue.length;
  }

  private async drain(): Promise<void> {
    this.draining = true;
    try {
      while (this.queue.length > 0 && this.handler) {
        const message = this.queue.shift()!;
        try {
          await this.handler(message);
        } catch {
          // Swallow handler errors — production inbox will move to a DLQ.
        }
      }
    } finally {
      this.draining = false;
    }
  }
}
