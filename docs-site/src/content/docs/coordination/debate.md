---
title: Debate
description: N agents argue to a verdict with a configurable judge.
---

```ts
import { runDebate } from "@corelay/mesh-coordination";

const result = await runDebate({
  topic: "Should we escalate this case?",
  participants: [
    { name: "cautious", stance: "Err on the side of escalation.", llm, model: "gpt-4o-mini" },
    { name: "measured", stance: "Only escalate on clear indicators.", llm, model: "gpt-4o-mini" },
  ],
  judge: { kind: "rule", decide: (topic, exchange) => ({ verdict: "escalate", rationale: "Safety first." }) },
  rounds: 2,
});
```

Three judge kinds: `rule` (synchronous), `human` (async), `llm` (LLM-backed).
