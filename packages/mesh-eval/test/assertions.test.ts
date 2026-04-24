import { describe, it, expect } from "vitest";
import { evaluateAssertion } from "../src/index.js";
import type { EvalJudge } from "../src/index.js";

describe("evaluateAssertion — contains", () => {
  it("passes when the substring is present (case-insensitive by default)", async () => {
    const r = await evaluateAssertion(
      { kind: "contains", value: "safe" },
      "You are SAFE here.",
      "hi",
    );
    expect(r.pass).toBe(true);
  });

  it("fails when substring is missing and reports the value", async () => {
    const r = await evaluateAssertion(
      { kind: "contains", value: "escalation" },
      "hello",
      "hi",
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("escalation");
  });

  it("respects caseSensitive", async () => {
    const r = await evaluateAssertion(
      { kind: "contains", value: "Safe", caseSensitive: true },
      "you are safe",
      "hi",
    );
    expect(r.pass).toBe(false);
  });

  it("uses the custom label when supplied", async () => {
    const r = await evaluateAssertion(
      { kind: "contains", value: "hi", label: "greeting present" },
      "hi",
      "x",
    );
    expect(r.label).toBe("greeting present");
  });
});

describe("evaluateAssertion — notContains", () => {
  it("passes when the substring is absent", async () => {
    const r = await evaluateAssertion(
      { kind: "notContains", value: "why haven't you left" },
      "You're safe to talk.",
      "hi",
    );
    expect(r.pass).toBe(true);
  });

  it("fails when the substring is present and reports it", async () => {
    const r = await evaluateAssertion(
      { kind: "notContains", value: "why haven't you left" },
      "Why haven't you left?",
      "hi",
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("unexpectedly");
  });
});

describe("evaluateAssertion — matches", () => {
  it("passes on a valid regex hit", async () => {
    const r = await evaluateAssertion(
      { kind: "matches", pattern: "^Hi\\b" },
      "Hi there",
      "x",
    );
    expect(r.pass).toBe(true);
  });

  it("fails on no match and reports the pattern", async () => {
    const r = await evaluateAssertion(
      { kind: "matches", pattern: "\\bdanger\\b" },
      "all clear",
      "x",
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("danger");
  });

  it("honours flags", async () => {
    const r = await evaluateAssertion(
      { kind: "matches", pattern: "hi", flags: "i" },
      "HI",
      "x",
    );
    expect(r.pass).toBe(true);
  });

  it("returns a failure (not a throw) on invalid regex", async () => {
    const r = await evaluateAssertion(
      { kind: "matches", pattern: "(" },
      "anything",
      "x",
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("errored");
  });
});

describe("evaluateAssertion — judged", () => {
  const passingJudge: EvalJudge = {
    judge: async () => ({ pass: true, rationale: "Meets the bar." }),
  };
  const failingJudge: EvalJudge = {
    judge: async () => ({ pass: false, rationale: "Tone too casual." }),
  };

  it("returns a failure when no judge is supplied", async () => {
    const r = await evaluateAssertion(
      { kind: "judged", criterion: "is trauma-informed" },
      "reply",
      "input",
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("No judge");
  });

  it("passes through the judge's verdict", async () => {
    const r = await evaluateAssertion(
      { kind: "judged", criterion: "is trauma-informed" },
      "reply",
      "input",
      passingJudge,
    );
    expect(r.pass).toBe(true);
    expect(r.message).toContain("Meets");
  });

  it("surfaces the judge's rationale on failure", async () => {
    const r = await evaluateAssertion(
      { kind: "judged", criterion: "is trauma-informed" },
      "reply",
      "input",
      failingJudge,
    );
    expect(r.pass).toBe(false);
    expect(r.message).toContain("Tone");
  });
});
