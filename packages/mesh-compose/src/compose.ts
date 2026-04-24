import type { AgentConfig, PeerCapability } from "@corelay/mesh-core";
import type { ComposeAuthor, ComposeDraft, ComposeSpec } from "./types.js";

/**
 * The JSON shape Compose asks its author LLM to produce. Compose only uses
 * fields it doesn't already have from the spec.
 */
export interface LlmDraftShape {
  /** Stable slug, used to resolve the agent by name. Default inferred from intent. */
  name: string;
  /** Short human-readable summary. */
  description: string;
  /** System prompt. Trauma-informed, on-topic, aware of the guardrails. */
  prompt: string;
  /** Opening message if this agent initiates a conversation. Optional. */
  welcomeMessage: string;
  /**
   * Questions the reviewer should consider before approving — e.g. boundaries
   * the spec didn't cover. Advisory, never a blocker.
   */
  reviewerQuestions: string[];
}

const MODEL_DEFAULT = "gpt-4o-mini";
const MAX_TOKENS_DEFAULT = 500;

/**
 * Turn a ComposeSpec into a ComposeDraft, using the supplied LLM author.
 *
 * The draft is a fully-formed AgentConfig that the reviewer inspects and
 * either approves (via `approve()`) or rejects. It is NEVER auto-saved —
 * that is the entire point of authoring-by-review.
 */
export const compose = async (
  spec: ComposeSpec,
  author: ComposeAuthor,
): Promise<ComposeDraft> => {
  if (!spec.intent || spec.intent.trim().length === 0) {
    throw new Error("ComposeSpec.intent is required");
  }

  const rawLlmOutput = await author.draft(spec);
  const parsed = parseDraft(rawLlmOutput);

  const model = spec.model ?? MODEL_DEFAULT;
  const allowedPeers = spec.allowedPeers ?? [];

  const config: AgentConfig = {
    name: parsed.name,
    description: parsed.description,
    prompt: parsed.prompt,
    model,
    maxResponseTokens: MAX_TOKENS_DEFAULT,
    welcomeMessage: parsed.welcomeMessage,
    guardrails: (spec.guardrails ?? []).join("\n"),
    tools: [],
    capabilities: allowedPeers.map(
      (address): PeerCapability => ({
        kind: "peer",
        address: address as PeerCapability["address"],
      }),
    ),
  };

  const provenance: Record<keyof AgentConfig, "user" | "llm" | "default"> = {
    name: "llm",
    description: "llm",
    prompt: "llm",
    model: spec.model ? "user" : "default",
    maxResponseTokens: "default",
    welcomeMessage: "llm",
    guardrails: spec.guardrails && spec.guardrails.length > 0 ? "user" : "default",
    tools: "default",
    capabilities: spec.allowedPeers && spec.allowedPeers.length > 0 ? "user" : "default",
  };

  return {
    config,
    provenance,
    rawLlmOutput,
    reviewerQuestions: parsed.reviewerQuestions,
  };
};

/**
 * Parse the raw author output. Accepts either a JSON object or a JSON string
 * wrapped in a fenced ```json block (which LLMs often add). Throws a precise
 * error if the shape is wrong — easier to debug than silent defaults.
 */
const parseDraft = (raw: string): LlmDraftShape => {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  let json: unknown;
  try {
    json = JSON.parse(unfenced);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Compose: author returned invalid JSON: ${cause}`);
  }

  if (!json || typeof json !== "object") {
    throw new Error("Compose: author returned a non-object");
  }

  const obj = json as Record<string, unknown>;
  const require = (key: keyof LlmDraftShape, kind: "string" | "array"): void => {
    if (kind === "string" && typeof obj[key] !== "string") {
      throw new Error(`Compose: author draft missing string field "${key}"`);
    }
    if (kind === "array" && !Array.isArray(obj[key])) {
      throw new Error(`Compose: author draft missing array field "${key}"`);
    }
  };

  require("name", "string");
  require("description", "string");
  require("prompt", "string");
  require("welcomeMessage", "string");
  require("reviewerQuestions", "array");

  return {
    name: obj.name as string,
    description: obj.description as string,
    prompt: obj.prompt as string,
    welcomeMessage: obj.welcomeMessage as string,
    reviewerQuestions: (obj.reviewerQuestions as unknown[]).map(String),
  };
};
