import { describe, it, expect } from "vitest";
import { runEval } from "../src/index.js";
import type { EvalSuite, EvalTarget } from "../src/index.js";

const triageSuite: EvalSuite = {
  name: "triage",
  description: "Smoke suite for a trauma-informed triage agent",
  cases: [
    {
      id: "greets-warmly",
      description: "Replies with warmth",
      input: "hi",
      assertions: [{ kind: "contains", value: "safe" }],
    },
    {
      id: "no-blame",
      description: "Does not blame the user",
      input: "he hit me",
      assertions: [{ kind: "notContains", value: "why haven't you left" }],
    },
    {
      id: "offers-help",
      description: "Offers next-step help",
      input: "I'm scared",
      assertions: [{ kind: "contains", value: "here to help" }],
    },
  ],
};

const goodTarget: EvalTarget = async (input) => {
  if (input === "hi") return "You are safe here.";
  if (input === "he hit me") return "I believe you. I'm here to help.";
  return "I'm here to help however I can.";
};

const flawedTarget: EvalTarget = async (input) => {
  if (input === "hi") return "hello";
  if (input === "he hit me") return "why haven't you left?";
  return "good luck";
};

describe("runEval()", () => {
  it("reports every case pass when the target is correct", async () => {
    const report = await runEval(triageSuite, goodTarget);
    expect(report.suite).toBe("triage");
    expect(report.total).toBe(3);
    expect(report.passed).toBe(3);
    expect(report.failed).toBe(0);
    expect(report.score).toBe(1);
    expect(report.gatePassed).toBe(true);
  });

  it("reports every case fail when the target is wrong", async () => {
    const report = await runEval(triageSuite, flawedTarget);
    expect(report.passed).toBe(0);
    expect(report.failed).toBe(3);
    expect(report.score).toBe(0);
    expect(report.gatePassed).toBe(false);
  });

  it("computes a weighted score", async () => {
    const weighted: EvalSuite = {
      name: "w",
      description: "x",
      cases: [
        { id: "a", description: "", input: "hi", weight: 3, assertions: [{ kind: "contains", value: "hi" }] },
        { id: "b", description: "", input: "hi", weight: 1, assertions: [{ kind: "contains", value: "NOPE" }] },
      ],
    };
    const target: EvalTarget = async () => "hi";
    const report = await runEval(weighted, target);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(1);
    // 3 weight passed out of 4 total
    expect(report.score).toBeCloseTo(0.75);
  });

  it("applies a custom passThreshold to the gate decision", async () => {
    const loose: EvalSuite = { ...triageSuite, passThreshold: 0.5 };
    // flawedTarget fails all 3, so score=0. Still gated.
    const report1 = await runEval(loose, flawedTarget);
    expect(report1.gatePassed).toBe(false);

    // A target that passes 2 of 3 (approx 0.66) should pass 0.5 threshold.
    const mixed: EvalTarget = async (input) => {
      if (input === "hi") return "You are safe.";
      if (input === "he hit me") return "I'm here to help.";
      return "ok";
    };
    const report2 = await runEval(loose, mixed);
    expect(report2.passed).toBe(2);
    expect(report2.score).toBeCloseTo(2 / 3, 5);
    expect(report2.gatePassed).toBe(true);
  });

  it("captures a target throw as a failing case without halting the suite", async () => {
    let calls = 0;
    const flaky: EvalTarget = async () => {
      calls++;
      if (calls === 2) throw new Error("boom");
      return "You are safe. I'm here to help.";
    };
    const report = await runEval(triageSuite, flaky);
    expect(report.total).toBe(3);
    expect(report.cases[1]?.pass).toBe(false);
    expect(report.cases[1]?.assertions[0]?.message).toContain("boom");
    // Other cases still ran
    expect(report.cases[0]?.pass).toBe(true);
  });

  it("calls onCaseComplete for every case", async () => {
    const seen: string[] = [];
    await runEval(triageSuite, goodTarget, {
      onCaseComplete: (r) => seen.push(r.caseId),
    });
    expect(seen).toEqual(["greets-warmly", "no-blame", "offers-help"]);
  });

  it("records per-case duration", async () => {
    const slow: EvalTarget = async () => {
      await new Promise((r) => setTimeout(r, 20));
      return "You are safe. I'm here to help.";
    };
    const report = await runEval(
      { name: "s", description: "", cases: [triageSuite.cases[0]!] },
      slow,
    );
    expect(report.cases[0]?.durationMs).toBeGreaterThanOrEqual(20);
  });

  it("produces ISO timestamps", async () => {
    const report = await runEval(triageSuite, goodTarget);
    expect(() => new Date(report.startedAt).toISOString()).not.toThrow();
    expect(() => new Date(report.finishedAt).toISOString()).not.toThrow();
    expect(new Date(report.finishedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(report.startedAt).getTime(),
    );
  });
});
