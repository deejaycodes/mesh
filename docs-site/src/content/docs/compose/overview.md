---
title: Authoring by Review
description: Domain experts describe, Compose drafts, operators approve.
---

```ts
import { compose, approve, createLlmAuthor } from "@corelay/mesh-compose";

const author = createLlmAuthor(llm);
const draft = await compose({ intent: "Triage agent for survivors.", guardrails: ["Never minimise."] }, author);

// Reviewer inspects draft.config, draft.reviewerQuestions
const config = approve(draft, { prompt: "...revised by practitioner..." });
```

There is no `save()`. There is no auto-approve. The structural impossibility of shipping an unreviewed draft is the point.
