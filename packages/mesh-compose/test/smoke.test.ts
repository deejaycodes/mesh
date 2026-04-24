import { describe, it, expect } from "vitest";

describe("@corelay/mesh-compose", () => {
  it("package loads", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
    expect(typeof mod.compose).toBe("function");
    expect(typeof mod.approve).toBe("function");
    expect(typeof mod.reject).toBe("function");
  });
});
