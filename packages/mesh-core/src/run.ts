import type { Address } from "./address.js";
import type { Message, MessageKind } from "./message.js";
import type { Peer } from "./peer.js";
import type { PeerRegistry } from "./peer-registry.js";
import type { WorkflowRecorder } from "./workflow-recorder.js";

export interface RunOptions {
  /** Override the ephemeral caller address. Useful for channel-driven flows. */
  from?: Address;
  /** Trace id for the workflow. Generated if omitted. */
  traceId?: string;
  /** Message id for the initial inbound message. Generated if omitted. */
  messageId?: string;
  /** How long to wait for a reply before rejecting. Default 30s. */
  timeoutMs?: number;
  /** Kind of the inbound message. Default "user". */
  kind?: MessageKind;
  /**
   * Optional recorder for durable workflow events. If supplied, run() creates
   * a Workflow, appends events for the initial send + final reply, and marks
   * the workflow completed/failed at the end.
   */
  recorder?: WorkflowRecorder;
}

export interface RunResult {
  content: string;
  traceId: string;
  /** Present only when a recorder was supplied. */
  workflowId?: string;
}

/**
 * Convenience helper for the common case: send one user message to a root
 * Peer, await the first reply back.
 *
 * If a WorkflowRecorder is supplied, the run is durably recorded:
 *   - createWorkflow on start
 *   - message_sent event for the inbound message
 *   - message_delivered event for the reply
 *   - updateStatus('completed') on success, 'failed' on timeout or error
 *
 * Without a recorder, run() is purely in-memory — the behaviour used by the
 * hello-agent example and many tests.
 */
export const run = async (
  registry: PeerRegistry,
  rootAddress: Address,
  userMessage: string,
  options: RunOptions = {},
): Promise<RunResult> => {
  const traceId = options.traceId ?? crypto.randomUUID();
  const messageId = options.messageId ?? crypto.randomUUID();
  const timeoutMs = options.timeoutMs ?? 30_000;
  const callerAddress = options.from ?? (`ephemeral/${crypto.randomUUID()}` as Address);
  const recorder = options.recorder;

  const workflow = recorder ? await recorder.createWorkflow(rootAddress) : undefined;

  let resolve: (r: RunResult) => void;
  let reject: (e: Error) => void;
  const replyPromise = new Promise<RunResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  const caller: Peer = {
    address: callerAddress,
    async send(message) {
      if (recorder && workflow) {
        await recorder.appendEvent(workflow.id, "message_delivered", {
          kind: "message_delivered",
          messageId: message.id,
          to: message.to,
        });
      }
      resolve({
        content: message.content,
        traceId: message.traceId,
        ...(workflow && { workflowId: workflow.id }),
      });
    },
  };
  registry.register(caller);

  const timer = setTimeout(() => {
    registry.unregister(callerAddress);
    reject(new Error(`run() timed out after ${timeoutMs}ms waiting for ${rootAddress}`));
  }, timeoutMs);

  const initial: Message = {
    id: messageId,
    from: callerAddress,
    to: rootAddress,
    kind: options.kind ?? "user",
    content: userMessage,
    traceId,
    createdAt: Date.now(),
  };

  try {
    if (recorder && workflow) {
      await recorder.appendEvent(workflow.id, "message_sent", {
        kind: "message_sent",
        message: initial,
      });
    }
    await registry.deliver(initial);
    const result = await replyPromise;
    if (recorder && workflow) {
      await recorder.updateStatus(workflow.id, "completed");
    }
    return result;
  } catch (err) {
    if (recorder && workflow) {
      const message = err instanceof Error ? err.message : String(err);
      await recorder.updateStatus(workflow.id, "failed", message).catch(() => {});
    }
    throw err;
  } finally {
    clearTimeout(timer);
    registry.unregister(callerAddress);
  }
};
