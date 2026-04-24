---
title: Self-Healing
description: Eval regression → Compose fix → human review → deploy.
---

```ts
import { heal, approve } from "@corelay/mesh-compose";

const result = await heal(currentConfig, regressionReport, author);
// result.draft is a ComposeDraft targeting the regressed cases
// result.targetedCases shows which cases triggered the fix

const fixed = approve(result.draft, { /* reviewer overrides */ });
// fixed goes through the deploy pipeline like any other config
```

One review step from regression to resolution.
