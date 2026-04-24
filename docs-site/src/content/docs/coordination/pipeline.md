---
title: Pipeline
description: A linear sequence of peers when the work is deterministic.
---

Pipeline is implicit in Mesh — it's what happens when peers message each other in sequence. No special primitive needed; the peer graph and workflow handle it.

```ts
// Agent A sends to Agent B, which sends to Agent C
// Each agent's capabilities list determines the allowed sequence
```
