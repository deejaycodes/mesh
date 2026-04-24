import type { Critic } from "@corelay/mesh-coordination";
import type { ComposeAuthor, ComposeSpec } from "./types.js";

/**
 * Wrap a ComposeAuthor with a Critic pass. The inner author drafts; the
 * Critic reviews the draft as if it were an agent response; the revised
 * output replaces the original. The reviewer still sees the final version
 * and can override — this just raises the floor.
 *
 * The Critic's "user message" is the rendered spec intent, and the
 * "agent response" is the raw JSON draft. The system prompt tells the
 * Critic it's reviewing a Compose draft, not a conversation reply.
 */
export const createCriticAuthor = (
  inner: ComposeAuthor,
  critic: Critic,
): ComposeAuthor => ({
  draft: async (spec: ComposeSpec): Promise<string> => {
    const raw = await inner.draft(spec);

    const verdict = await critic.review({
      userMessage: `Compose spec intent: ${spec.intent}`,
      agentResponse: raw,
      systemPrompt:
        "You are reviewing a Compose draft (a JSON AgentConfig). " +
        "Check that the prompt is on-domain, trauma-informed where relevant, " +
        "and that the reviewerQuestions surface real gaps. " +
        "If the draft is acceptable, approve it. If not, revise the JSON.",
    });

    return verdict.content;
  },
});
