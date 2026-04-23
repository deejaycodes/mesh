import { noopTracer, type Tracer } from "@corelay/mesh-observe";
import type {
  Address,
  Inbox,
  Message,
  Peer,
  PeerRegistry,
} from "@corelay/mesh-core";

export type HumanDecision = "approve" | "reject" | "edit" | "reassign";

export interface HumanAction {
  decision: HumanDecision;
  /**
   * For `edit`: the edited content to send in place of the original.
   * For `reject`: the reason, surfaced to the caller.
   * For `reassign`: the new target address.
   * For `approve`: optional extra note the caller may record.
   */
  content?: string;
  /** Target address for `reassign`. */
  reassignTo?: Address;
  /** Who acted, for audit. */
  actor?: string;
}

export interface PendingItem {
  /** The worklist item id. Returned when the item was enqueued. */
  id: string;
  /** The message awaiting human attention. */
  message: Message;
  /** Epoch millis when it entered the worklist. */
  receivedAt: number;
}

export interface HumanPeerConfig {
  /** The human peer's address — e.g. `safevoice/caseworker/alice`. */
  address: Address;
  /** Durable inbox persisting the worklist. In-memory or Postgres. */
  inbox: Inbox;
  /** Registry used to deliver responses back to the caller. */
  registry: PeerRegistry;
  /**
   * Optional escalation policy: if a worklist item isn't answered within
   * `timeoutMs`, the HumanPeer automatically delivers a synthetic reply
   * (or reassigns it to `fallbackAddress`) so the flow doesn't stall.
   */
  escalation?: EscalationPolicy;
  /** Optional tracer. Defaults to noopTracer. */
  tracer?: Tracer;
}

export interface EscalationPolicy {
  timeoutMs: number;
  /**
   * - `reject` (default) — deliver a rejection to the caller with
   *   `reason` as content.
   * - `reassign` — forward the original content to `fallbackAddress`.
   */
  onTimeout?: "reject" | "reassign";
  /** Reassign target. Required when `onTimeout === 'reassign'`. */
  fallbackAddress?: Address;
  /** Reason surfaced in the escalation reply. Default: "Human review timed out." */
  reason?: string;
}

/**
 * A Human as a Peer.
 *
 * When a message arrives, it is stored in the human's durable worklist and
 * the workflow is effectively suspended — no in-process wait, just a
 * message sitting in an inbox that hasn't been consumed yet.
 *
 * A real human (via an API, UI, or WhatsApp reply) later calls `respond()`
 * with a decision. The HumanPeer builds a reply Message and delivers it
 * back to the original sender via the registry, resuming the flow.
 *
 * Decisions:
 *   - approve   → deliver the original message content, unchanged, to the
 *                 caller
 *   - reject    → deliver a rejection reason to the caller (caller decides
 *                 whether to escalate)
 *   - edit      → deliver `action.content` (edited by the human) to the
 *                 caller
 *   - reassign  → deliver the original message to a different address
 *                 entirely (`action.reassignTo`)
 */
export class HumanPeer implements Peer {
  readonly address: Address;
  private readonly inbox: Inbox;
  private readonly registry: PeerRegistry;
  private readonly escalation?: EscalationPolicy;
  private readonly tracer: Tracer;
  private readonly pending = new Map<string, PendingItem>();
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(config: HumanPeerConfig) {
    this.address = config.address;
    this.inbox = config.inbox;
    this.registry = config.registry;
    this.escalation = config.escalation;
    this.tracer = config.tracer ?? noopTracer;
  }

  /**
   * Start consuming the durable inbox into the in-memory pending list.
   * Call once at startup.
   */
  async start(): Promise<void> {
    await this.inbox.consume(async (message) => {
      this.pending.set(message.id, {
        id: message.id,
        message,
        receivedAt: Date.now(),
      });
      this.scheduleEscalation(message);
    });
  }

  /** Peer.send — append to the durable inbox. */
  async send(message: Message): Promise<void> {
    await this.inbox.append(message);
  }

  /** Enumerate items awaiting human attention. Ordered by arrival time. */
  list(): PendingItem[] {
    return [...this.pending.values()].sort((a, b) => a.receivedAt - b.receivedAt);
  }

  /**
   * Record a human's decision on one pending item and deliver the resulting
   * reply message to the original sender. Throws if the item is unknown.
   */
  async respond(itemId: string, action: HumanAction): Promise<void> {
    const item = this.pending.get(itemId);
    if (!item) {
      throw new Error(`HumanPeer ${this.address}: no pending item with id "${itemId}"`);
    }

    await this.tracer.span(
      "coordination.human.respond",
      {
        "human.address": this.address,
        "human.decision": action.decision,
        "human.actor": action.actor ?? null,
        "message.id": item.message.id,
        "message.trace_id": item.message.traceId,
      },
      async () => {
        const reply = this.buildReply(item.message, action);
        this.clearItem(itemId);
        await this.registry.deliver(reply);
      },
    );
  }

  /** Stop all pending escalation timers. Call before shutdown. */
  stop(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  private scheduleEscalation(message: Message): void {
    if (!this.escalation) return;
    const timer = setTimeout(() => {
      void this.escalate(message.id).catch(() => {
        // Best-effort escalation; swallow to avoid unhandled rejections in the
        // timer callback. Production telemetry would log here.
      });
    }, this.escalation.timeoutMs);
    this.timers.set(message.id, timer);
  }

  private async escalate(itemId: string): Promise<void> {
    const item = this.pending.get(itemId);
    if (!item || !this.escalation) return;

    const mode = this.escalation.onTimeout ?? "reject";
    const reason = this.escalation.reason ?? "Human review timed out.";

    if (mode === "reassign") {
      if (!this.escalation.fallbackAddress) {
        throw new Error(
          `HumanPeer ${this.address}: escalation onTimeout='reassign' requires fallbackAddress`,
        );
      }
      await this.respond(itemId, {
        decision: "reassign",
        reassignTo: this.escalation.fallbackAddress,
        actor: "system:escalation",
      });
      return;
    }

    await this.respond(itemId, {
      decision: "reject",
      content: reason,
      actor: "system:escalation",
    });
  }

  private clearItem(itemId: string): void {
    this.pending.delete(itemId);
    const timer = this.timers.get(itemId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(itemId);
    }
  }

  private buildReply(original: Message, action: HumanAction): Message {
    const base: Omit<Message, "to" | "content"> = {
      id: `${original.id}-human-${action.decision}`,
      from: this.address,
      kind: "peer",
      traceId: original.traceId,
      createdAt: Date.now(),
      metadata: {
        ...(original.metadata ?? {}),
        human: {
          decision: action.decision,
          ...(action.actor !== undefined && { actor: action.actor }),
          ...(action.content !== undefined && { note: action.content }),
        },
      },
    };

    switch (action.decision) {
      case "approve":
        return { ...base, to: original.from, content: original.content };
      case "reject":
        return {
          ...base,
          to: original.from,
          content: action.content ?? "Rejected by human reviewer.",
        };
      case "edit":
        if (action.content === undefined) {
          throw new Error(`HumanPeer ${this.address}: 'edit' requires action.content`);
        }
        return { ...base, to: original.from, content: action.content };
      case "reassign":
        if (action.reassignTo === undefined) {
          throw new Error(`HumanPeer ${this.address}: 'reassign' requires action.reassignTo`);
        }
        return { ...base, to: action.reassignTo, content: original.content };
    }
  }
}
