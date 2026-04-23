import type { AgentConfig } from "./agent-config.js";
import type { Inbox } from "./inbox.js";
import type { LLMClient } from "./llm.js";
import type { Message } from "./message.js";
import type { Peer } from "./peer.js";
import type { Address } from "./address.js";

/**
 * Day 3 Agent — minimal peer that receives a message, calls the LLM with the
 * system prompt + the user message, and exposes the last reply.
 *
 * Deliberately incomplete:
 *   - No PeerRegistry yet (Day 4). Replies are stashed on `lastReply` so tests
 *     can assert on them without a routing layer.
 *   - No tool calls. No memory. No critic, learnings, guardrails. Those layers
 *     come later in the week and in subsequent weeks.
 *   - Single-turn: one inbound message → one LLM call → one reply.
 */
export class Agent implements Peer {
  public lastReply?: Message;

  constructor(
    public readonly address: Address,
    private readonly config: AgentConfig,
    private readonly llm: LLMClient,
    private readonly inbox: Inbox,
  ) {}

  async start(): Promise<void> {
    await this.inbox.consume((m) => this.handle(m));
  }

  async send(message: Message): Promise<void> {
    await this.inbox.append(message);
  }

  private async handle(message: Message): Promise<void> {
    const response = await this.llm.chat({
      messages: [
        { role: "system", content: this.config.prompt },
        { role: "user", content: message.content },
      ],
      model: this.config.model,
      maxTokens: this.config.maxResponseTokens,
    });

    this.lastReply = {
      id: `${message.id}-reply`,
      from: this.address,
      to: message.from,
      kind: "assistant",
      content: response.content,
      traceId: message.traceId,
      createdAt: Date.now(),
    };
  }
}
