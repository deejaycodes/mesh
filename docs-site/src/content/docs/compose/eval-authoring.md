---
title: Eval Authoring
description: Auto-generate eval suites from worked examples.
---

```ts
import { generateEvalSuite } from "@corelay/mesh-compose";

const suite = generateEvalSuite({
  intent: "Triage agent.",
  examples: [
    { input: "hi", desiredReply: "You're safe to talk here." },
    { input: "he hit me", desiredReply: "I believe you. I'm here to help." },
  ],
  guardrails: ["Never minimise.", "Never ask why they haven't left."],
}, "safevoice-triage");

// suite.cases has contains assertions from examples + notContains from guardrails
```

The practitioner's examples become the quality gate automatically.
