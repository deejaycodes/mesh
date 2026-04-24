import type { AgentConfig } from "@corelay/mesh-core";
import type { ComposeAuthor, ComposeSpec } from "./types.js";

/**
 * A multi-agent workflow spec. Extends ComposeSpec with agent roles
 * and their relationships.
 */
export interface WorkflowSpec {
  /** Overall intent for the workflow. */
  intent: string;
  /** Named agent roles and their individual intents. */
  agents: ReadonlyArray<{
    role: string;
    intent: string;
    guardrails?: ReadonlyArray<string>;
  }>;
  /** How agents relate: who delegates to whom, who critiques whom. */
  coordination: ReadonlyArray<{
    from: string;
    to: string;
    pattern: "delegates" | "critiques" | "escalates";
  }>;
  /** Global guardrails applied to every agent. */
  guardrails?: ReadonlyArray<string>;
  /** Preferred model for all agents. */
  model?: string;
}

/**
 * The output of workflow composition: a set of AgentConfigs wired together
 * with the right capabilities, plus the coordination metadata.
 */
export interface WorkflowDraft {
  /** One AgentConfig per role, keyed by role name. */
  configs: Readonly<Record<string, AgentConfig>>;
  /** The coordination edges, preserved for audit. */
  coordination: WorkflowSpec["coordination"];
  /** Questions for the reviewer about the overall flow. */
  reviewerQuestions: ReadonlyArray<string>;
  /** Raw LLM output for audit. */
  rawLlmOutput: string;
}

interface LlmWorkflowDraft {
  agents: Array<{
    role: string;
    name: string;
    description: string;
    prompt: string;
    welcomeMessage: string;
  }>;
  reviewerQuestions: string[];
}

/**
 * Compose a multi-agent workflow from a WorkflowSpec.
 *
 * Each agent is drafted individually via the author, then wired together
 * with capabilities matching the coordination edges. The result is a set
 * of AgentConfigs that can be instantiated as a working agent society.
 */
export const composeWorkflow = async (
  spec: WorkflowSpec,
  author: ComposeAuthor,
): Promise<WorkflowDraft> => {
  if (spec.agents.length === 0) {
    throw new Error("WorkflowSpec must have at least one agent");
  }

  const prompt = renderWorkflowPrompt(spec);
  const rawLlmOutput = await author.draft({ intent: prompt });
  const parsed = parseWorkflowDraft(rawLlmOutput);

  const globalGuardrails = (spec.guardrails ?? []).join("\n");
  const model = spec.model ?? "gpt-4o-mini";

  // Build capability map from coordination edges
  const capMap = new Map<string, string[]>();
  for (const edge of spec.coordination) {
    const existing = capMap.get(edge.from) ?? [];
    existing.push(edge.to);
    capMap.set(edge.from, existing);
  }

  const configs: Record<string, AgentConfig> = {};
  for (const agentSpec of spec.agents) {
    const drafted = parsed.agents.find((a) => a.role === agentSpec.role);
    const agentGuardrails = [
      globalGuardrails,
      ...(agentSpec.guardrails ?? []),
    ].filter(Boolean).join("\n");

    const peers = (capMap.get(agentSpec.role) ?? []).map((to) => ({
      kind: "peer" as const,
      address: `workflow/${to}` as `${string}/${string}`,
    }));

    configs[agentSpec.role] = {
      name: drafted?.name ?? agentSpec.role,
      description: drafted?.description ?? agentSpec.intent,
      prompt: drafted?.prompt ?? `You are the ${agentSpec.role} agent. ${agentSpec.intent}`,
      model,
      maxResponseTokens: 400,
      welcomeMessage: drafted?.welcomeMessage ?? "",
      guardrails: agentGuardrails,
      tools: [],
      capabilities: peers,
    };
  }

  return {
    configs,
    coordination: spec.coordination,
    reviewerQuestions: parsed.reviewerQuestions,
    rawLlmOutput,
  };
};

const renderWorkflowPrompt = (spec: WorkflowSpec): string => {
  const parts = [
    `Design a multi-agent workflow: ${spec.intent}`,
    "",
    "Agents:",
    ...spec.agents.map((a) => `  - ${a.role}: ${a.intent}`),
    "",
    "Coordination:",
    ...spec.coordination.map((c) => `  - ${c.from} ${c.pattern} ${c.to}`),
  ];
  if (spec.guardrails && spec.guardrails.length > 0) {
    parts.push("", "Global guardrails:", ...spec.guardrails.map((g) => `  - ${g}`));
  }
  parts.push("", "Return JSON with agents array (role, name, description, prompt, welcomeMessage) and reviewerQuestions array.");
  return parts.join("\n");
};

const parseWorkflowDraft = (raw: string): LlmWorkflowDraft => {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  let json: unknown;
  try {
    json = JSON.parse(unfenced);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Compose workflow: invalid JSON: ${cause}`);
  }

  if (!json || typeof json !== "object") {
    throw new Error("Compose workflow: non-object response");
  }

  const obj = json as Record<string, unknown>;
  return {
    agents: Array.isArray(obj.agents) ? obj.agents as LlmWorkflowDraft["agents"] : [],
    reviewerQuestions: Array.isArray(obj.reviewerQuestions)
      ? (obj.reviewerQuestions as unknown[]).map(String)
      : [],
  };
};
