import { describe, it, expect } from "vitest";
import { noopTracer } from "../src/tracer.js";
import type { Tracer } from "../src/tracer.js";

/**
 * Shared contract tests for the Tracer interface. Runs against every
 * Tracer implementation (noop + OTel). Asserts behaviour, not shape —
 * observer tests in otel-tracer.test.ts cover the span payload.
 */
const runContract = (label: string, tracer: Tracer) => {
  describe(`Tracer contract: ${label}`, () => {
    it("returns the result of fn", async () => {
      const out = await tracer.span("work", {}, async () => 42);
      expect(out).toBe(42);
    });

    it("propagates rejections from fn unchanged", async () => {
      await expect(
        tracer.span("work", {}, async () => {
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
    });

    it("fn receives a context exposing setAttribute / setAttributes / recordException / setStatus", async () => {
      await tracer.span("work", {}, async (ctx) => {
        // No assertions on observables here — the shape is what matters.
        ctx.setAttribute("k", "v");
        ctx.setAttributes({ a: 1, b: true, c: null });
        ctx.recordException(new Error("x"));
        ctx.setStatus("ok", "fine");
      });
    });
  });
};

runContract("noopTracer", noopTracer);
