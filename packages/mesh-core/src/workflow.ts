import type { Address } from "./address.js";
import type { Message } from "./message.js";
import type { ToolCall, ToolResult } from "./tool.js";

/**
 * A Workflow represents one durable run — typically a single user conversation
 * with an Agent, from the inbound message through to the final reply (and
 * any handoffs in between).
 *
 * The Workflow row is the unit of durability: on pod crash, a Workflow with
 * status "running" can be resumed from its last event. Day 5 ships the row
 * and the event log; resumption itself is Week 2.
 */
export interface Workflow {
  id: string;
  /** Address of the Peer this workflow is rooted at (typically an Agent). */
  rootPeer: Address;
  status: WorkflowStatus;
  /** Epoch millis. */
  startedAt: number;
  /** Epoch millis; null until terminal. */
  updatedAt: number;
  /** Present when status is "failed". */
  error?: string;
}

export type WorkflowStatus = "running" | "completed" | "failed";

/**
 * An append-only record of everything that happened in a Workflow. Replaying
 * the events yields the Workflow's full state. Events are insert-only —
 * never updated, never deleted.
 */
export interface WorkflowEvent {
  id: string;
  workflowId: string;
  kind: WorkflowEventKind;
  /** Epoch millis. */
  at: number;
  /** Discriminator-specific payload. */
  data: WorkflowEventData;
}

export type WorkflowEventKind =
  | "message_sent"
  | "message_delivered"
  | "llm_call_started"
  | "llm_call_completed"
  | "tool_call_started"
  | "tool_call_completed"
  | "workflow_completed"
  | "workflow_failed";

export type WorkflowEventData =
  | { kind: "message_sent"; message: Message }
  | { kind: "message_delivered"; messageId: string; to: Address }
  | { kind: "llm_call_started"; peer: Address; model: string }
  | { kind: "llm_call_completed"; peer: Address; model: string; content: string; totalTokens: number }
  | { kind: "tool_call_started"; peer: Address; call: ToolCall }
  | { kind: "tool_call_completed"; peer: Address; result: ToolResult }
  | { kind: "workflow_completed" }
  | { kind: "workflow_failed"; error: string };
