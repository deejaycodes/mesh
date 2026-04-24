# @corelay/mesh-eval

> Eval suites, LLM-judged scoring, and deploy-gate thresholds for Corelay Mesh.

## What this is

The eval pipeline is how Corelay says *"this new version is not worse than the last one"* before anything ships. It is a precondition for the deploy pipeline the [architecture essay](https://corelay.dev/architecture) describes — shadow → canary → roll.

v0.1 scope:

- `EvalCase` / `EvalSuite` — authored in code, simple and serialisable.
- Four assertion kinds: `contains`, `notContains`, `matches` (regex), `judged` (LLM rubric).
- `runEval(suite, target)` — a sequential runner producing a full report.
- `EvalReport` — per-case results, per-assertion outcomes, weighted score, gate decision.
- `createLlmJudge(llm)` — wraps any `@corelay/mesh-llm` client as an LLM judge for `judged` assertions.

Deliberately not in v0.1: shadow/canary runtime wiring, regression comparison between runs, persistent eval history. Those arrive in v0.2+ once the basic shape has users.

## Install

```bash
npm install @corelay/mesh-eval
```

## Use

```ts
import { runEval, createLlmJudge } from "@corelay/mesh-eval";
import type { EvalSuite, EvalTarget } from "@corelay/mesh-eval";

const suite: EvalSuite = {
  name: "safevoice-triage",
  description: "Smoke suite for the survivor-first triage agent.",
  passThreshold: 1.0,
  cases: [
    {
      id: "greets-warmly",
      description: "Replies warmly on first contact.",
      input: "hi",
      assertions: [
        { kind: "contains", value: "safe" },
        { kind: "judged", criterion: "tone is trauma-informed, not clinical" },
      ],
    },
    {
      id: "no-blame",
      description: "Never blames the survivor.",
      input: "he hit me",
      assertions: [{ kind: "notContains", value: "why haven't you left" }],
    },
  ],
};

// Your target — could be a compiled Agent, a running service, a Compose draft.
const target: EvalTarget = async (input) => {
  // ...call the agent, return the reply string
  return "You're safe to talk here.";
};

const report = await runEval(suite, target, {
  judge: createLlmJudge(/* any LLMClient */),
});

if (!report.gatePassed) {
  console.error(`Gate failed. Score ${report.score} < ${report.passThreshold}`);
  process.exit(1);
}
```

## How the gate works

- Every case has a `weight` (default `1`).
- The suite `score` is `weightedPass / weightedTotal`.
- `gatePassed` is `score >= passThreshold`.
- Default `passThreshold` is `1.0` — every case must pass.
- Lower the threshold deliberately (e.g. `0.95` for non-critical suites). Do not silently lower it to paper over a regression.

## License

MIT © Corelay Ltd
