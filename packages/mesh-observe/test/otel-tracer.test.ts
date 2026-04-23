import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { OTelTracer } from "../src/otel-tracer.js";

let exporter: InMemorySpanExporter;
let provider: BasicTracerProvider;

beforeEach(() => {
  exporter = new InMemorySpanExporter();
  provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  // AsyncLocalStorage context manager — required for nested spans to
  // propagate across async boundaries in Node.js.
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);
  trace.setGlobalTracerProvider(provider);
});

afterEach(async () => {
  await provider.shutdown();
  context.disable();
  trace.disable();
});

const finishedSpans = (): ReadableSpan[] => exporter.getFinishedSpans();

describe("OTelTracer", () => {
  it("emits one span per call with the configured name and attributes", async () => {
    const tracer = new OTelTracer({ name: "test" });
    await tracer.span("work", { tenant: "safevoice", n: 3 }, async () => 42);

    const spans = finishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.name).toBe("work");
    expect(spans[0]?.attributes.tenant).toBe("safevoice");
    expect(spans[0]?.attributes.n).toBe(3);
  });

  it("returns the result of fn", async () => {
    const tracer = new OTelTracer({ name: "test" });
    const out = await tracer.span("x", {}, async () => "hello");
    expect(out).toBe("hello");
  });

  it("records exceptions and sets error status when fn rejects", async () => {
    const tracer = new OTelTracer({ name: "test" });
    await expect(
      tracer.span("failing", {}, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    const spans = finishedSpans();
    expect(spans).toHaveLength(1);
    expect(spans[0]?.status.code).toBe(2); // SpanStatusCode.ERROR
    // Exception is recorded as an event on the span.
    const events = spans[0]?.events ?? [];
    expect(events.some((e) => e.name === "exception")).toBe(true);
  });

  it("nests child spans automatically inside fn", async () => {
    const tracer = new OTelTracer({ name: "test" });
    await tracer.span("parent", {}, async () => {
      await tracer.span("child", {}, async () => "ok");
    });

    const spans = finishedSpans();
    // InMemorySpanExporter emits spans as they end — child before parent.
    expect(spans.map((s) => s.name)).toEqual(["child", "parent"]);
    const child = spans.find((s) => s.name === "child")!;
    const parent = spans.find((s) => s.name === "parent")!;
    // Child should share the parent's traceId and point at the parent's
    // spanId. parentSpanContext / parentSpanId field names vary across
    // OTel SDK versions; check both.
    expect(child.spanContext().traceId).toBe(parent.spanContext().traceId);
    const childParentSpanId =
      child.parentSpanContext?.spanId ??
      (child as unknown as { parentSpanId?: string }).parentSpanId;
    expect(childParentSpanId).toBe(parent.spanContext().spanId);
  });

  it("lets fn mutate the span via SpanContext", async () => {
    const tracer = new OTelTracer({ name: "test" });
    await tracer.span("work", {}, async (ctx) => {
      ctx.setAttribute("added", "yes");
      ctx.setAttributes({ also: "this" });
    });

    const [span] = finishedSpans();
    expect(span?.attributes.added).toBe("yes");
    expect(span?.attributes.also).toBe("this");
  });

  it("ignores undefined/null attribute values", async () => {
    const tracer = new OTelTracer({ name: "test" });
    await tracer.span(
      "work",
      { keep: "x", drop: undefined, alsoDrop: null },
      async () => undefined,
    );

    const [span] = finishedSpans();
    expect(span?.attributes.keep).toBe("x");
    expect(span?.attributes.drop).toBeUndefined();
    expect(span?.attributes.alsoDrop).toBeUndefined();
  });
});
