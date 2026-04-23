/**
 * Primitive attribute values we allow on spans. Intentionally narrow — no
 * arrays-of-arrays, no objects. Callers that want richer payloads serialise
 * them to JSON strings at the call site.
 */
export type SpanAttributes = Record<
  string,
  string | number | boolean | undefined | null
>;

/**
 * Handed to the span body. Callers record attributes, mark exceptions, or
 * override the span's final status.
 */
export interface SpanContext {
  setAttribute(key: string, value: SpanAttributes[string]): void;
  setAttributes(attrs: SpanAttributes): void;
  recordException(err: unknown): void;
  setStatus(status: "ok" | "error", message?: string): void;
}

/**
 * The tracer API consumed by instrumented Mesh primitives.
 *
 * `span(name, attrs, fn)` runs `fn(ctx)` inside a span named `name` with
 * the initial `attrs`. The span ends automatically when `fn` resolves or
 * rejects; a rejection is recorded as an exception and the span's status
 * is set to `error` before the original error propagates.
 *
 * A tracer passes context between nested spans implicitly — callers don't
 * need to plumb a span object through their code. `fn` calling the same
 * tracer's `span` creates a child span.
 */
export interface Tracer {
  span<T>(
    name: string,
    attributes: SpanAttributes,
    fn: (ctx: SpanContext) => Promise<T>,
  ): Promise<T>;
}

/**
 * Default tracer. Runs the function. Records nothing. Used by
 * instrumented primitives when the caller doesn't supply a real tracer —
 * means "no instrumentation" is the same code path as instrumented code,
 * just cheaper.
 */
export const noopTracer: Tracer = {
  async span(_name, _attrs, fn) {
    const ctx: SpanContext = {
      setAttribute() {},
      setAttributes() {},
      recordException() {},
      setStatus() {},
    };
    return fn(ctx);
  },
};
