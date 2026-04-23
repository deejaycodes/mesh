# traced-agent

Minimal Corelay Mesh example with **tracing wired to a console exporter**.

Same shape as `hello-agent`, plus:

- OpenTelemetry TracerProvider with `ConsoleSpanExporter`
- `AsyncLocalStorageContextManager` registered so nested spans propagate
- `OTelTracer` from `@corelay/mesh-observe` passed to the Agent

Run it and you'll see the full span tree printed as the Agent handles one message:

- `agent.handle` — outer
- `llm.chat` — inner, with token counts and finish reason

## Setup

```bash
# From the workspace root:
npm install

# At least one of these must be set:
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Optionally override the model — defaults to gpt-4o-mini:
export MODEL=gpt-4o-mini

cd examples/traced-agent
npm start
# or with a custom question:
npm start -- "Tell me about Lagos in one sentence."
```

## What you'll see

The console exporter prints each span as JSON when the span ends. You'll see `llm.chat` end first (inner), then `agent.handle` (outer), with matching `traceId` and `parentSpanId` fields connecting them.

For production, replace `ConsoleSpanExporter` with `OTLPTraceExporter` pointed at Honeycomb, Tempo, Jaeger, or an OpenTelemetry Collector. The rest of the code is identical.
