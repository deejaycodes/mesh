# @corelay/mesh-compose

> Corelay Compose — an authoring agent that drafts `AgentConfig`s from intent, for a human to review and approve.

## What this is

The core thesis of Corelay is **authoring-by-review**: in mission-led domains, the people who know the work (safeguarding practitioners, revenue officers, caseworkers) are not the people who write code, and they should not be asked to. Instead, they describe the agent they want, an authoring agent drafts the config, and the domain expert reviews, revises, and approves.

This package ships the v0.1 of that — intentionally minimal:

- `compose(spec, author)` — turn a `ComposeSpec` into a `ComposeDraft`.
- `approve(draft, overrides?)` — explicit approval returning an `AgentConfig`.
- `reject(draft, reason?)` — explicit rejection.
- Full provenance tracking — every `AgentConfig` field tagged as `user` / `llm` / `default`.

Compose **never auto-saves**. A caller must explicitly `approve()`.

## Install

```bash
npm install @corelay/mesh-compose
```

## Use

```ts
import OpenAI from "openai";
import { compose, approve, createLlmAuthor } from "@corelay/mesh-compose";
import { OpenAIClient } from "@corelay/mesh-llm";

const llm = new OpenAIClient({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY! }) });
const author = createLlmAuthor(llm);

const draft = await compose(
  {
    intent: "First-contact triage for survivors of domestic abuse on WhatsApp.",
    domain: ["safeguarding", "UK", "trauma-informed"],
    guardrails: ["Never minimise.", "Never ask why they haven't left."],
    allowedPeers: ["safevoice/caseworker"],
  },
  author,
);

// A reviewer inspects draft.config and draft.reviewerQuestions, makes changes,
// and approves:
const config = approve(draft, { prompt: "...a better prompt from the practitioner..." });
// config is an AgentConfig you can now pass to Agent.
```

You can also plug in a custom `ComposeAuthor` — any object with a
`draft(spec): Promise<string>` method, returning the JSON draft shape. This
is what tests do; it's also how you'd back Compose with a different
provider, an offline model, or a cached draft.

## What's not in v0.2

- **Critic-wrapped authoring** — v0.3 will compose Compose with `@corelay/mesh-coordination`'s `withCritic` so the draft is automatically challenged before the reviewer sees it.
- **Eval generation** — once `@corelay/mesh-eval` ships.
- **Workflow authoring** — v1.0. Currently Compose drafts a single agent; soon it will draft multi-agent flows.

## License

MIT © Corelay Ltd
