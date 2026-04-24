---
title: Agent
description: A configured AI persona that receives messages, acts via capabilities, and emits messages to other peers.
---

An Agent is the core building block. It has an address, a config (prompt, tools, guardrails, model), an Inbox, and a set of Capabilities that constrain what it can do.

```ts
import { Agent, MemoryInbox, PeerRegistry, type AgentConfig } from "@corelay/mesh-core";

const config: AgentConfig = {
  name: "triage",
  description: "First-contact triage.",
  prompt: "You are a trauma-informed first responder.",
  model: "gpt-4o-mini",
  maxResponseTokens: 400,
  welcomeMessage: "You're safe to talk here.",
  guardrails: "Never minimise.",
  tools: [],
  capabilities: [{ kind: "peer", address: "safevoice/caseworker" }],
};

const registry = new PeerRegistry();
const agent = new Agent("safevoice/triage", config, llm, new MemoryInbox(), registry);
registry.register(agent);
await agent.start();
```

An Agent can only send messages to addresses listed in its `capabilities`. Attempts to address unlisted peers throw `CapabilityError`.
