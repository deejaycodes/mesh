import type { Address, Message, Peer, PeerRegistry } from "@corelay/mesh-core";
import type { Critic } from "./critic.js";

export interface CriticPeerConfig {
  /** The address this critic-peer answers to. */
  address: Address;
  /** The address to forward critiqued messages to. */
  forwardTo: Address;
  /** The Critic doing the work. */
  critic: Critic;
  /**
   * System prompt the critic uses when revising. Typically the original
   * agent's system prompt so the revised reply stays in the agent's voice.
   */
  systemPrompt: string;
  /**
   * How to extract the "user's question" that the response is answering.
   * Defaults to the last user/peer message in the trace, but a caller may
   * override (e.g. SafeVoice injects the original WhatsApp inbound).
   */
  userMessageFor?: (message: Message) => string;
  /** The registry to deliver the forwarded (possibly revised) message to. */
  registry: PeerRegistry;
}

/**
 * A Peer that critiques every message it receives and forwards the result
 * (revised or approved) to the configured `forwardTo` address.
 *
 * This is the "coordination primitive" form of Critic: the Agent sending
 * the message doesn't know its reply is being reviewed. It just addresses
 * the critic-peer, and the message arrives at its real destination —
 * possibly rewritten — with a traceable hop in between.
 *
 * Trade-off: the critic can't see the user's original question unless the
 * caller arranges for it to be visible. By default the critic-peer uses
 * the message it receives as both "what was said" and "what it was said
 * in response to". Provide `userMessageFor` to look up the real inbound
 * from elsewhere (e.g. the current agent conversation's history).
 */
export const withCritic = (config: CriticPeerConfig): Peer => ({
  address: config.address,
  async send(message: Message) {
    const userMessage = config.userMessageFor ? config.userMessageFor(message) : message.content;

    const verdict = await config.critic.review({
      userMessage,
      agentResponse: message.content,
      systemPrompt: config.systemPrompt,
    });

    const forwarded: Message = {
      ...message,
      id: `${message.id}-critiqued`,
      to: config.forwardTo,
      content: verdict.content,
      metadata: {
        ...(message.metadata ?? {}),
        critic: {
          revised: verdict.revised,
          cycles: verdict.cycles,
          ...(verdict.lastCritique !== undefined && { lastCritique: verdict.lastCritique }),
        },
      },
    };

    await config.registry.deliver(forwarded);
  },
});
