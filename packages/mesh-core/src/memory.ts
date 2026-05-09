import type { LLMMessage } from "./llm.js";

/**
 * Stores conversation history per session (keyed by traceId).
 * Agents use this to maintain multi-turn context.
 */
export interface ConversationMemory {
  /** Append a message to the conversation. */
  append(sessionId: string, message: LLMMessage): Promise<void>;
  /** Get the last N messages for a session. */
  getHistory(sessionId: string, maxMessages?: number): Promise<LLMMessage[]>;
  /** Clear a session's history. */
  clear(sessionId: string): Promise<void>;
}

/**
 * In-memory conversation buffer. Suitable for single-instance deployments.
 * For multi-pod, use a Postgres-backed implementation.
 */
export class MemoryConversationBuffer implements ConversationMemory {
  private readonly sessions = new Map<string, LLMMessage[]>();
  private readonly maxPerSession: number;

  constructor(maxPerSession = 50) {
    this.maxPerSession = maxPerSession;
  }

  async append(sessionId: string, message: LLMMessage): Promise<void> {
    const history = this.sessions.get(sessionId) ?? [];
    history.push(message);
    // Evict oldest messages beyond the cap
    if (history.length > this.maxPerSession) {
      history.splice(0, history.length - this.maxPerSession);
    }
    this.sessions.set(sessionId, history);
  }

  async getHistory(sessionId: string, maxMessages?: number): Promise<LLMMessage[]> {
    const history = this.sessions.get(sessionId) ?? [];
    if (maxMessages && history.length > maxMessages) {
      return history.slice(-maxMessages);
    }
    return [...history];
  }

  async clear(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}
