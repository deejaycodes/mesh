---
title: Hierarchy
description: Manager decomposes, workers execute, collector merges.
---

```ts
import { Hierarchy, LLMDecomposer, LLMMerger } from "@corelay/mesh-coordination";

const hierarchy = new Hierarchy({
  task: "Help this survivor with safety planning and service finding.",
  workers: [safetyPlannerAgent, serviceFinderAgent],
  decomposer: new LLMDecomposer({ llm, model: "gpt-4o-mini" }),
  merger: new LLMMerger({ llm, model: "gpt-4o-mini" }),
});

const result = await hierarchy.run();
```

Workers run concurrently. The merger combines their outputs into a single response.
