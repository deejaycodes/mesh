/**
 * Type-level compile-time assertions for @corelay/mesh-core public types.
 *
 * These aren't runtime tests — the proof is that `tsc` succeeds with this
 * file compiled. A regression in a type will surface as a build failure
 * before any test runs.
 */
import type {
  Address,
  Message,
  Peer,
  Inbox,
  Capability,
  ToolDefinition,
  ToolCall,
  ToolResult,
  LLMClient,
  LLMRequest,
  LLMResponse,
  AgentConfig,
} from "../src/index.js";

type Expect<T extends true> = T;
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;

// Address accepts the two-segment and three-segment shapes.
const _a1: Address = "safevoice/triage";
const _a2: Address = "safevoice/caseworker/alice";

// Message literal conforms to the interface.
const _m: Message = {
  id: "m-1",
  from: "safevoice/triage",
  to: "safevoice/safety-plan",
  kind: "peer",
  content: "hello",
  traceId: "t-1",
  createdAt: 0,
};

// Peer literal conforms to the interface.
const _peer: Peer = {
  address: "safevoice/triage",
  async send() {
    // noop
  },
};

// Inbox literal conforms to the interface.
const _inbox: Inbox = {
  async append() {
    // noop
  },
  async consume() {
    // noop
  },
};

// Capability discriminated union accepts each variant.
const _c1: Capability = { kind: "tool", name: "find_services" };
const _c2: Capability = { kind: "peer", address: "safevoice/handoff" };
const _c3: Capability = { kind: "channel", name: "whatsapp" };

// Tool types compose correctly.
const _td: ToolDefinition = { name: "x", description: "y", parameters: {} };
const _tc: ToolCall = { id: "c-1", name: "x", arguments: {} };
const _tr: ToolResult = { toolCallId: "c-1", content: "ok" };

// LLM types compose correctly.
const _req: LLMRequest = {
  messages: [{ role: "user", content: "hi" }],
  model: "gpt-4o-mini",
};
const _res: LLMResponse = {
  content: "hi",
  model: "gpt-4o-mini",
  toolCalls: [],
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  finishReason: "stop",
};

// LLMClient can be implemented by a plain object.
const _llm: LLMClient = {
  name: "mock",
  async chat() {
    return _res;
  },
};

// AgentConfig requires all its fields.
const _ac: AgentConfig = {
  name: "triage",
  description: "",
  prompt: "",
  model: "gpt-4o-mini",
  maxResponseTokens: 500,
  welcomeMessage: "",
  guardrails: "",
  tools: [],
  capabilities: [],
};

// MessageKind is the exact expected union.
import type { MessageKind } from "../src/message.js";
type _mk = Expect<
  Equal<MessageKind, "user" | "assistant" | "tool" | "system" | "peer">
>;

// All the import bindings above must be marked as used to keep tsc happy.
void [_a1, _a2, _m, _peer, _inbox, _c1, _c2, _c3, _td, _tc, _tr, _req, _res, _llm, _ac];
type _use_mk = _mk;
