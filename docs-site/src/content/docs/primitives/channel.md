---
title: Channel
description: External-network adapters that surface users as peers.
---

Channels bridge external networks into the Mesh peer graph. Available:
- `@corelay/mesh-channels-whatsapp` — WhatsApp Cloud API
- `@corelay/mesh-channels-sms` — Twilio SMS
- `@corelay/mesh-channels-slack` — Slack Bot

Each channel provides: a client (outbound), a parser (inbound), and a `userPeer` factory that creates a Peer for each external user.
