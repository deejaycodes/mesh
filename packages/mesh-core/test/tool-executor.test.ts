import { describe, it, expect } from "vitest";
import { ToolRegistry } from "../src/tool-executor.js";

describe("ToolRegistry", () => {
  it("executes a registered tool and returns content", async () => {
    const registry = new ToolRegistry({
      greet: async (args) => `Hello, ${args.name}!`,
    });

    const result = await registry.execute({ id: "call-1", name: "greet", arguments: { name: "Deji" } });
    expect(result.toolCallId).toBe("call-1");
    expect(result.content).toBe("Hello, Deji!");
    expect(result.error).toBeUndefined();
  });

  it("returns error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute({ id: "call-2", name: "unknown", arguments: {} });
    expect(result.error).toBe(true);
    expect(result.content).toContain("Unknown tool: unknown");
  });

  it("catches handler errors and returns ToolResult with error flag", async () => {
    const registry = new ToolRegistry({
      fail: async () => { throw new Error("DB connection lost"); },
    });

    const result = await registry.execute({ id: "call-3", name: "fail", arguments: {} });
    expect(result.error).toBe(true);
    expect(result.content).toContain("DB connection lost");
    expect(result.toolCallId).toBe("call-3");
  });

  it("supports registering tools after construction", async () => {
    const registry = new ToolRegistry();
    registry.register("add", async (args) => String(Number(args.a) + Number(args.b)));

    const result = await registry.execute({ id: "call-4", name: "add", arguments: { a: 2, b: 3 } });
    expect(result.content).toBe("5");
  });
});
