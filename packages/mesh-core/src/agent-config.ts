import type { Capability } from "./capability.js";
import type { ToolDefinition } from "./tool.js";

/**
 * An Agent's static configuration — the authored spec that defines who it is
 * and what it is allowed to do.
 *
 * AgentConfigs are versioned in Studio; Corelay Mesh loads them by name and
 * runs an Agent instance per conversation.
 */
export interface AgentConfig {
  /** Stable slug, used to resolve the agent by name. */
  name: string;
  /** Short human-readable summary of what the agent does. */
  description: string;
  /** System prompt. Injected at tier 1 of every request. */
  prompt: string;
  /** Default LLM model id (e.g. "gpt-4o-mini"). Overridable per request. */
  model: string;
  /** Hard cap on the response length from the LLM, in tokens. */
  maxResponseTokens: number;
  /** Opening message if this agent initiates a conversation. */
  welcomeMessage: string;
  /** Human-readable guardrail rules. Interpretation is up to the safety layer. */
  guardrails: string;
  /** Tools the agent may call. Must be paired with matching ToolCapability entries. */
  tools: ToolDefinition[];
  /** Explicit capability grants. The runtime enforces these strictly. */
  capabilities: Capability[];
}
