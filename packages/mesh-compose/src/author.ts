import type { LLMClient, LLMRequest } from "@corelay/mesh-core";
import type { ComposeAuthor, ComposeSpec } from "./types.js";

const SYSTEM_PROMPT = `You are Corelay Compose, an authoring agent.

Your single job is to draft an AgentConfig from a human's natural-language
spec. Domain experts — safeguarding practitioners, revenue officers,
caseworkers — will describe the agent they want; you draft the configuration
they review.

You MUST return a single JSON object with exactly these keys:
- name: string. Stable kebab-case slug inferred from the intent.
- description: string. One short sentence. What the agent does.
- prompt: string. The system prompt. Trauma-informed where relevant,
  on-domain, specific. Do not invent safety rules the spec did not ask for —
  the spec's guardrails are enforced separately.
- welcomeMessage: string. Optional opening message (empty string if not
  appropriate).
- reviewerQuestions: string[]. 1–4 questions the reviewer should consider
  before approving. e.g. boundaries the spec did not cover. Advisory only.

Return ONLY the JSON object. No prose, no commentary, no code fences.`;

export interface CreateLlmAuthorOptions {
  /** Model id to request. Default "gpt-4o-mini". */
  model?: string;
  /** Lower is more deterministic. Default 0.2 — Compose prefers boring drafts. */
  temperature?: number;
  /** Cap on draft length. Default 800 tokens. */
  maxTokens?: number;
}

/**
 * Turn any @corelay/mesh-core LLMClient into a Compose author.
 *
 * The author sends a Compose-specific system prompt plus the rendered spec,
 * and returns the raw completion as the JSON draft Compose parses. Keeping
 * this layer small means anyone can plug in OpenAI, Anthropic, Bedrock, or
 * a router with all three.
 */
export const createLlmAuthor = (
  llm: LLMClient,
  options: CreateLlmAuthorOptions = {},
): ComposeAuthor => ({
  draft: async (spec: ComposeSpec): Promise<string> => {
    const request: LLMRequest = {
      model: options.model ?? "gpt-4o-mini",
      temperature: options.temperature ?? 0.2,
      maxTokens: options.maxTokens ?? 800,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: renderSpec(spec) },
      ],
    };

    const response = await llm.chat(request);
    return response.content;
  },
});

/**
 * Render a ComposeSpec as the single user-turn prompt the author sees.
 *
 * Kept deterministic — the same spec always produces the same prompt — so
 * tests can snapshot the rendering separately from the LLM response.
 */
export const renderSpec = (spec: ComposeSpec): string => {
  const parts: string[] = [`Intent: ${spec.intent}`];

  if (spec.domain && spec.domain.length > 0) {
    parts.push(`Domain: ${spec.domain.join(", ")}`);
  }

  if (spec.examples && spec.examples.length > 0) {
    parts.push("Worked examples:");
    for (const [i, ex] of spec.examples.entries()) {
      parts.push(`  ${i + 1}. Input: ${ex.input}`);
      parts.push(`     Desired reply: ${ex.desiredReply}`);
    }
  }

  if (spec.guardrails && spec.guardrails.length > 0) {
    parts.push("Guardrails (enforced separately — do not restate as safety rules):");
    for (const g of spec.guardrails) {
      parts.push(`  - ${g}`);
    }
  }

  if (spec.allowedPeers && spec.allowedPeers.length > 0) {
    parts.push(`Allowed peer addresses: ${spec.allowedPeers.join(", ")}`);
  }

  parts.push("");
  parts.push("Draft the AgentConfig. Return JSON only.");

  return parts.join("\n");
};
