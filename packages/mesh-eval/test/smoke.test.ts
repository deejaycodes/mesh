import { describe, it, expect } from "vitest";

describe("@corelay/mesh-eval", () => {
  it("package loads", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
    expect(typeof mod.runEval).toBe("function");
    expect(typeof mod.evaluateAssertion).toBe("function");
    expect(typeof mod.createLlmJudge).toBe("function");
  });
});
