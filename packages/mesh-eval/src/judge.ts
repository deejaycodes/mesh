import type { LLMClient } from "@corelay/mesh-core";
import type { EvalJudge } from "./types.js";

const JUDGE_SYSTEM = `You are an evaluation judge for Corelay Mesh.

You will be given an original user input, the agent's reply, and a criterion.
Your job is to decide — strictly and consistently — whether the reply
satisfies the criterion.

Return a JSON object with exactly two keys:
- pass: boolean. true if the reply clearly satisfies the criterion.
- rationale: string. One short sentence explaining the decision.

Be precise. If the criterion is partly met, err on the side of fail — the
point of an eval judge is to raise regressions, not to be kind.

Return ONLY the JSON object. No prose, no commentary, no code fences.`;

export interface CreateLlmJudgeOptions {
  /** Model id. Defaults to "gpt-4o-mini" — cheap and sharp enough for rubrics. */
  model?: string;
  /** Temperature. Default 0 — the judge should be deterministic. */
  temperature?: number;
}

/**
 * Turn any @corelay/mesh-core LLMClient into an EvalJudge.
 *
 * Matches the Compose author factory shape: one function, takes a client,
 * returns the narrower judge interface the runner consumes.
 */
export const createLlmJudge = (
  llm: LLMClient,
  options: CreateLlmJudgeOptions = {},
): EvalJudge => ({
  judge: async ({ criterion, reply, originalInput }) => {
    const response = await llm.chat({
      model: options.model ?? "gpt-4o-mini",
      temperature: options.temperature ?? 0,
      maxTokens: 200,
      messages: [
        { role: "system", content: JUDGE_SYSTEM },
        {
          role: "user",
          content: [
            `Original input: ${originalInput}`,
            `Agent reply: ${reply}`,
            `Criterion: ${criterion}`,
            "",
            "Verdict as JSON.",
          ].join("\n"),
        },
      ],
    });

    return parseVerdict(response.content);
  },
});

const parseVerdict = (raw: string): { pass: boolean; rationale: string } => {
  const trimmed = raw.trim();
  const unfenced = trimmed.startsWith("```")
    ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
    : trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfenced);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    return { pass: false, rationale: `Judge returned invalid JSON: ${cause}` };
  }

  if (!parsed || typeof parsed !== "object") {
    return { pass: false, rationale: "Judge returned a non-object" };
  }

  const obj = parsed as Record<string, unknown>;
  const pass = typeof obj.pass === "boolean" ? obj.pass : false;
  const rationale =
    typeof obj.rationale === "string"
      ? obj.rationale
      : "Judge did not supply a rationale.";

  return { pass, rationale };
};
