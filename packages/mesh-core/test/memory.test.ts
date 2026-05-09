import { describe, it, expect } from "vitest";
import { MemoryConversationBuffer } from "../src/memory.js";

describe("MemoryConversationBuffer", () => {
  it("stores and retrieves messages by session", async () => {
    const buffer = new MemoryConversationBuffer();
    await buffer.append("session-1", { role: "user", content: "Hello" });
    await buffer.append("session-1", { role: "assistant", content: "Hi there" });

    const history = await buffer.getHistory("session-1");
    expect(history).toHaveLength(2);
    expect(history[0]!.content).toBe("Hello");
    expect(history[1]!.content).toBe("Hi there");
  });

  it("isolates sessions", async () => {
    const buffer = new MemoryConversationBuffer();
    await buffer.append("s1", { role: "user", content: "A" });
    await buffer.append("s2", { role: "user", content: "B" });

    expect(await buffer.getHistory("s1")).toHaveLength(1);
    expect(await buffer.getHistory("s2")).toHaveLength(1);
    expect((await buffer.getHistory("s1"))[0]!.content).toBe("A");
  });

  it("evicts oldest messages when maxPerSession exceeded", async () => {
    const buffer = new MemoryConversationBuffer(3);
    await buffer.append("s", { role: "user", content: "1" });
    await buffer.append("s", { role: "assistant", content: "2" });
    await buffer.append("s", { role: "user", content: "3" });
    await buffer.append("s", { role: "assistant", content: "4" });

    const history = await buffer.getHistory("s");
    expect(history).toHaveLength(3);
    expect(history[0]!.content).toBe("2"); // "1" was evicted
  });

  it("respects maxMessages in getHistory", async () => {
    const buffer = new MemoryConversationBuffer();
    for (let i = 0; i < 10; i++) {
      await buffer.append("s", { role: "user", content: `msg-${i}` });
    }

    const last3 = await buffer.getHistory("s", 3);
    expect(last3).toHaveLength(3);
    expect(last3[0]!.content).toBe("msg-7");
  });

  it("clears a session", async () => {
    const buffer = new MemoryConversationBuffer();
    await buffer.append("s", { role: "user", content: "test" });
    await buffer.clear("s");
    expect(await buffer.getHistory("s")).toEqual([]);
  });

  it("evicts LRU sessions when maxSessions exceeded", async () => {
    const buffer = new MemoryConversationBuffer(50, 3); // max 3 sessions

    await buffer.append("s1", { role: "user", content: "first" });
    await buffer.append("s2", { role: "user", content: "second" });
    await buffer.append("s3", { role: "user", content: "third" });

    // Access s1 to make it recent
    await buffer.getHistory("s1");

    // Add s4 — should evict s2 (least recently accessed)
    await buffer.append("s4", { role: "user", content: "fourth" });

    expect(await buffer.getHistory("s1")).toHaveLength(1); // still exists
    expect(await buffer.getHistory("s2")).toEqual([]); // evicted
    expect(await buffer.getHistory("s3")).toHaveLength(1); // still exists
    expect(await buffer.getHistory("s4")).toHaveLength(1); // new
  });

  it("returns empty array for unknown session", async () => {
    const buffer = new MemoryConversationBuffer();
    expect(await buffer.getHistory("nonexistent")).toEqual([]);
  });
});
