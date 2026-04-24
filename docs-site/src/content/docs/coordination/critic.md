---
title: Critic
description: One agent challenges another's output. Thesis, antithesis, synthesis.
---

```ts
import { Critic } from "@corelay/mesh-coordination";

const critic = new Critic({ llm, model: "gpt-4o-mini", domain: "safeguarding" });
const verdict = await critic.review({
  userMessage: "I'm scared",
  agentResponse: "Everything will be fine.",
  systemPrompt: "You are a triage agent.",
});
// verdict.revised === true, verdict.content === improved response
```

Use `withCritic()` to wrap an agent as a peer — the agent doesn't know its output is being reviewed.
