---
title: Workflow Authoring
description: Compose drafts multi-agent flows from natural language.
---

```ts
import { composeWorkflow } from "@corelay/mesh-compose";

const draft = await composeWorkflow({
  intent: "Survivor triage with specialist delegation.",
  agents: [
    { role: "triage", intent: "First contact." },
    { role: "safety-planner", intent: "One safety step." },
    { role: "service-finder", intent: "Local NGOs." },
  ],
  coordination: [
    { from: "triage", to: "safety-planner", pattern: "delegates" },
    { from: "triage", to: "service-finder", pattern: "delegates" },
  ],
}, author);

// draft.configs has one AgentConfig per role, wired with capabilities
```
