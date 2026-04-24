---
title: Human-in-the-Loop
description: A human peer with escalation policy and timeout.
---

```ts
import { HumanPeer } from "@corelay/mesh-coordination";

const caseworker = new HumanPeer({
  address: "safevoice/caseworker",
  inbox: new MemoryInbox(),
  registry,
  escalation: {
    timeoutMs: 5 * 60 * 1000,
    onTimeout: "reject",
    reason: "Caseworker did not respond in time.",
  },
});
```

Humans are first-class peers. The same patterns that work for agents (escalation, override, timeout) work identically for people.
