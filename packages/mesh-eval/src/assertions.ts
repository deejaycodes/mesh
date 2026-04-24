import type {
  Assertion,
  AssertionResult,
  EvalJudge,
} from "./types.js";

/**
 * Evaluate a single assertion against a reply. Returns a result; never
 * throws. An assertion's own error becomes a failure with the error in
 * the message — we want the report to be complete, not halt mid-suite.
 */
export const evaluateAssertion = async (
  assertion: Assertion,
  reply: string,
  originalInput: string,
  judge?: EvalJudge,
): Promise<AssertionResult> => {
  const label = assertion.label ?? defaultLabel(assertion);

  try {
    switch (assertion.kind) {
      case "contains":
        return evaluateContains(assertion, reply, label);
      case "notContains":
        return evaluateNotContains(assertion, reply, label);
      case "matches":
        return evaluateMatches(assertion, reply, label);
      case "judged":
        return await evaluateJudged(assertion, reply, originalInput, label, judge);
    }
  } catch (err) {
    return {
      kind: assertion.kind,
      label,
      pass: false,
      message: `Assertion errored: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
};

const evaluateContains = (
  a: { value: string; caseSensitive?: boolean },
  reply: string,
  label: string,
): AssertionResult => {
  const hay = a.caseSensitive ? reply : reply.toLowerCase();
  const needle = a.caseSensitive ? a.value : a.value.toLowerCase();
  const pass = hay.includes(needle);
  return {
    kind: "contains",
    label,
    pass,
    message: pass ? undefined : `Reply did not contain "${a.value}"`,
  };
};

const evaluateNotContains = (
  a: { value: string; caseSensitive?: boolean },
  reply: string,
  label: string,
): AssertionResult => {
  const hay = a.caseSensitive ? reply : reply.toLowerCase();
  const needle = a.caseSensitive ? a.value : a.value.toLowerCase();
  const pass = !hay.includes(needle);
  return {
    kind: "notContains",
    label,
    pass,
    message: pass ? undefined : `Reply unexpectedly contained "${a.value}"`,
  };
};

const evaluateMatches = (
  a: { pattern: string; flags?: string },
  reply: string,
  label: string,
): AssertionResult => {
  const regex = new RegExp(a.pattern, a.flags);
  const pass = regex.test(reply);
  return {
    kind: "matches",
    label,
    pass,
    message: pass ? undefined : `Reply did not match /${a.pattern}/${a.flags ?? ""}`,
  };
};

const evaluateJudged = async (
  a: { criterion: string },
  reply: string,
  originalInput: string,
  label: string,
  judge?: EvalJudge,
): Promise<AssertionResult> => {
  if (!judge) {
    return {
      kind: "judged",
      label,
      pass: false,
      message: "No judge supplied — cannot evaluate judged assertion",
    };
  }
  const { pass, rationale } = await judge.judge({
    criterion: a.criterion,
    reply,
    originalInput,
  });
  return {
    kind: "judged",
    label,
    pass,
    message: rationale,
  };
};

const defaultLabel = (a: Assertion): string => {
  switch (a.kind) {
    case "contains":
      return `contains "${truncate(a.value, 40)}"`;
    case "notContains":
      return `does not contain "${truncate(a.value, 40)}"`;
    case "matches":
      return `matches /${truncate(a.pattern, 40)}/`;
    case "judged":
      return `judged: ${truncate(a.criterion, 60)}`;
  }
};

const truncate = (s: string, n: number): string =>
  s.length <= n ? s : s.slice(0, n - 1) + "…";
