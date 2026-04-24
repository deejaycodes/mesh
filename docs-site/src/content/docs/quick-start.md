---
title: Quick Start
description: Install Corelay Mesh and run your first agent.
---

```bash
npm install @corelay/mesh-core @corelay/mesh-llm openai
```

```ts
import OpenAI from "openai";
import { Agent, MemoryInbox, PeerRegistry, run, type AgentConfig } from "@corelay/mesh-core";
import { LLMRouter, OpenAIClient } from "@corelay/mesh-llm";

const CALLER = "demo/caller" as const;
const openai = new OpenAIClient({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }) });
const llm = new LLMRouter({ primary: openai.name, providers: [openai] });

const config: AgentConfig = {
  name: "assistant",
  description: "Concise, helpful.",
  prompt: "You are a concise, helpful assistant.",
  model: "gpt-4o-mini",
  maxResponseTokens: 200,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [{ kind: "peer", address: CALLER }],
};

const registry = new PeerRegistry();
const agent = new Agent("demo/assistant", config, llm, new MemoryInbox(), registry);
registry.register(agent);
await agent.start();

const result = await run(registry, "demo/assistant", "What is a peer society?", { from: CALLER });
console.log(result.content);
```

See [examples/hello-agent](https://github.com/corelay-dev/mesh/tree/main/examples/hello-agent) for a full working example with LLM fallbacks.
