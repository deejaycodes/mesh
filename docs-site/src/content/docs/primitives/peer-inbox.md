---
title: Peer & Inbox
description: The addressing abstraction and the durable message queue.
---

**Peer** is the addressing abstraction. Agents, humans, and channels are all peers. Addresses look like `tenant/role` or `tenant/role/instance`.

**Inbox** is a durable, ordered queue for messages to a peer. Two implementations:
- `MemoryInbox` — in-process, for tests and dev
- `PostgresInbox` — Postgres-backed, at-least-once delivery, survives pod restarts

```ts
import { MemoryInbox } from "@corelay/mesh-core";
import { PostgresInbox } from "@corelay/mesh-postgres";

// Dev
const inbox = new MemoryInbox();

// Production
const inbox = new PostgresInbox({ pool, address: "safevoice/triage" });
```
