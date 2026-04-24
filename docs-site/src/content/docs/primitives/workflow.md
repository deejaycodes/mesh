---
title: Workflow
description: Durable execution envelope with a typed event log.
---

Every agent run is a Workflow instance. The event log records every message sent, every tool call, every human handoff. If a pod crashes, another pod resumes from the log.

```ts
import { WorkflowStore } from "@corelay/mesh-postgres";

const store = new WorkflowStore({ pool });
const workflow = await store.createWorkflow("safevoice/triage");
await store.appendEvent(workflow.id, "message_sent", { ... });
await store.updateStatus(workflow.id, "completed");
```

`sweepStaleWorkflows()` picks up workflows whose owner pod has disappeared.
