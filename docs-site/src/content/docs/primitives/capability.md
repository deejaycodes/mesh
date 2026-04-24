---
title: Capability
description: Permissioned declarations of what an agent can do.
---

Capabilities are explicit grants. Three kinds:
- `PeerCapability` — permission to message a specific peer address
- `ToolCapability` — permission to call a named tool
- `ChannelCapability` — permission to emit to an outbound channel

Enforced at dispatch. An agent that tries to message outside its capabilities gets a `CapabilityError`.

```ts
const capabilities = [
  { kind: "peer", address: "safevoice/caseworker" },
  { kind: "tool", name: "search-services" },
  { kind: "channel", name: "whatsapp" },
];
```
