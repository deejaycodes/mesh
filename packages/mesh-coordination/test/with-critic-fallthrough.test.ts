import { describe, it, expect, vi } from "vitest";
import { withCritic } from "../src/with-critic.js";
import type { Address, Message, Peer, PeerRegistry } from "@corelay/mesh-core";
import type { Critic, CriticVerdict } from "../src/critic.js";

function createMockRegistry(): { registry: PeerRegistry; delivered: Message[] } {
  const delivered: Message[] = [];
  const registry = {
    register: vi.fn(),
    unregister: vi.fn(),
    has: vi.fn(() => true),
    get: vi.fn(),
    async deliver(message: Message) { delivered.push(message); },
  } as unknown as PeerRegistry;
  return { registry, delivered };
}

function createMockCritic(verdict: CriticVerdict): Critic {
  return {
    async review() { return verdict; },
  } as unknown as Critic;
}

function createFailingCritic(): Critic {
  return {
    async review() { throw new Error("LLM timeout"); },
  } as unknown as Critic;
}

describe("withCritic — error fallthrough", () => {
  it("delivers original content when critic fails", async () => {
    const { registry, delivered } = createMockRegistry();

    const criticPeer = withCritic({
      address: "test/critic" as Address,
      forwardTo: "test/target" as Address,
      critic: createFailingCritic(),
      systemPrompt: "You are helpful.",
      registry,
    });

    const message: Message = {
      id: "msg-1",
      from: "test/agent" as Address,
      to: "test/critic" as Address,
      kind: "assistant",
      content: "Original response that should be preserved",
      traceId: "trace-1",
      createdAt: Date.now(),
    };

    await criticPeer.send(message);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.content).toBe("Original response that should be preserved");
    expect(delivered[0]!.metadata?.critic).toEqual({ failed: true, revised: false, cycles: 0 });
  });

  it("delivers revised content when critic succeeds", async () => {
    const { registry, delivered } = createMockRegistry();

    const criticPeer = withCritic({
      address: "test/critic" as Address,
      forwardTo: "test/target" as Address,
      critic: createMockCritic({ content: "Improved response", cycles: 1, revised: true }),
      systemPrompt: "You are helpful.",
      registry,
    });

    const message: Message = {
      id: "msg-2",
      from: "test/agent" as Address,
      to: "test/critic" as Address,
      kind: "assistant",
      content: "Original",
      traceId: "trace-2",
      createdAt: Date.now(),
    };

    await criticPeer.send(message);

    expect(delivered).toHaveLength(1);
    expect(delivered[0]!.content).toBe("Improved response");
    expect(delivered[0]!.metadata?.critic).toEqual({ revised: true, cycles: 1 });
  });

  it("forwards to correct address", async () => {
    const { registry, delivered } = createMockRegistry();

    const criticPeer = withCritic({
      address: "test/critic" as Address,
      forwardTo: "test/final-destination" as Address,
      critic: createMockCritic({ content: "ok", cycles: 0, revised: false }),
      systemPrompt: "",
      registry,
    });

    await criticPeer.send({
      id: "msg-3", from: "test/a" as Address, to: "test/critic" as Address,
      kind: "assistant", content: "test", traceId: "t", createdAt: Date.now(),
    });

    expect(delivered[0]!.to).toBe("test/final-destination");
  });
});
