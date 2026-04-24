---
title: Packages
description: All @corelay/mesh-* packages.
---

| Package | Description |
|---|---|
| `@corelay/mesh-core` | Agent, Peer, Inbox, Capability, Workflow, PeerRegistry, run(), canaryPeer |
| `@corelay/mesh-postgres` | Durable WorkflowStore, PostgresInbox, sweepStaleWorkflows |
| `@corelay/mesh-llm` | LLMRouter + OpenAI, Anthropic, Bedrock clients |
| `@corelay/mesh-coordination` | Critic, Debate, Hierarchy, HumanPeer |
| `@corelay/mesh-channels-whatsapp` | WhatsApp Cloud API channel adapter |
| `@corelay/mesh-channels-sms` | SMS (Twilio) channel adapter |
| `@corelay/mesh-channels-slack` | Slack channel adapter |
| `@corelay/mesh-observe` | Tracer interface + OpenTelemetry implementation |
| `@corelay/mesh-compose` | Authoring agent — compose, approve, reject, workflow authoring, self-healing, eval authoring |
| `@corelay/mesh-eval` | Eval suites, LLM-judged scoring, deploy-gate thresholds, regression comparison |
| `@corelay/mesh-mcp` | MCP server — expose agents as tools for Claude Desktop / Cursor / ChatGPT |

All packages are MIT-licensed and published on npm under the `@corelay` scope.
