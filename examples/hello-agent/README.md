# hello-agent

Minimal Corelay Mesh example. One agent, one tool-less turn, one real LLM call, routed through `@corelay/mesh-llm`'s `LLMRouter`.

## Setup

```bash
# From the workspace root:
npm install

# At least one of these must be set:
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Optionally override the model — defaults to gpt-4o-mini:
export MODEL=claude-3-5-haiku-latest

# Run it:
cd examples/hello-agent
npm start
# or with a custom question:
npm start -- "Tell me about Lagos in one sentence."
```

## What it does

1. Builds an `LLMRouter` from whichever providers you've configured (first provider is primary; the rest are fallbacks).
2. Creates a `PeerRegistry`, registers a single agent at `demo/hello`, gives it a capability to reply to `demo/caller`.
3. Calls `run(registry, "demo/hello", question)`.
4. Prints the reply.

That is it. No durability (Postgres), no tools, no critic, no channels. See the architecture doc for what lands next.
