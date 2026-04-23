import { describe, it, expect, vi } from "vitest";
import { PeerRegistry, type Address, type Peer, type Message } from "@corelay/mesh-core";
import { WhatsAppClient } from "../src/client.js";
import { handleWebhook } from "../src/webhook.js";

const textWebhook = (overrides: {
  from?: string;
  body?: string;
  id?: string;
  phoneNumberId?: string;
} = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      changes: [
        {
          value: {
            metadata: { phone_number_id: overrides.phoneNumberId ?? "PNID" },
            messages: [
              {
                from: overrides.from ?? "447911123456",
                id: overrides.id ?? "wamid.a",
                timestamp: "1714200000",
                type: "text",
                text: { body: overrides.body ?? "hello" },
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
});

const makeOutboundClient = () => {
  const fetchStub = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    async text() {
      return "";
    },
  });
  const client = new WhatsAppClient({
    accessToken: "TOKEN",
    defaultPhoneNumberId: "PNID",
    fetchImpl: fetchStub as unknown as typeof globalThis.fetch,
  });
  return { client, fetchStub };
};

const sinkAgentPeer = (address: Address): Peer & { received: Message[] } => ({
  address,
  received: [],
  async send(m) {
    (this as unknown as { received: Message[] }).received.push(m);
  },
});

describe("handleWebhook GET (verify challenge)", () => {
  it("returns the challenge when mode + token match", async () => {
    const { client } = makeOutboundClient();
    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry: new PeerRegistry(),
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      {
        method: "GET",
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "SECRET",
          "hub.challenge": "xyz",
        },
      },
    );

    expect(res).toEqual({ status: 200, body: "xyz", contentType: "text/plain" });
  });

  it("returns 403 when the verify token is wrong", async () => {
    const { client } = makeOutboundClient();
    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry: new PeerRegistry(),
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      {
        method: "GET",
        query: {
          "hub.mode": "subscribe",
          "hub.verify_token": "WRONG",
          "hub.challenge": "xyz",
        },
      },
    );

    expect(res.status).toBe(403);
  });

  it("returns 403 when challenge is missing", async () => {
    const { client } = makeOutboundClient();
    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry: new PeerRegistry(),
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "SECRET" } },
    );
    expect(res.status).toBe(403);
  });
});

describe("handleWebhook POST (inbound delivery)", () => {
  it("delivers each inbound message to the configured routeTo address", async () => {
    const registry = new PeerRegistry();
    const agent = sinkAgentPeer("safevoice/triage");
    registry.register(agent);
    const { client } = makeOutboundClient();

    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry,
        outboundClient: client,
        routeTo: "safevoice/triage",
        makeTraceId: () => "fixed-trace",
      },
      { method: "POST", body: textWebhook({ from: "447911123456", body: "hi" }) },
    );

    expect(res.status).toBe(200);
    expect(agent.received).toHaveLength(1);
    expect(agent.received[0]?.content).toBe("hi");
    expect(agent.received[0]?.from).toBe("whatsapp/447911123456");
    expect(agent.received[0]?.to).toBe("safevoice/triage");
    expect(agent.received[0]?.traceId).toBe("fixed-trace");
  });

  it("auto-registers a UserPeer for each new sender address", async () => {
    const registry = new PeerRegistry();
    registry.register(sinkAgentPeer("safevoice/triage"));
    const { client } = makeOutboundClient();

    await handleWebhook(
      {
        verifyToken: "SECRET",
        registry,
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "POST", body: textWebhook({ from: "447911000001" }) },
    );
    await handleWebhook(
      {
        verifyToken: "SECRET",
        registry,
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "POST", body: textWebhook({ from: "447911000002" }) },
    );

    expect(registry.has("whatsapp/447911000001" as Address)).toBe(true);
    expect(registry.has("whatsapp/447911000002" as Address)).toBe(true);
  });

  it("returns 200 even when the body is malformed", async () => {
    const registry = new PeerRegistry();
    registry.register(sinkAgentPeer("safevoice/triage"));
    const { client } = makeOutboundClient();

    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry,
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "POST", body: { nonsense: true } },
    );

    expect(res.status).toBe(200);
  });

  it("returns 200 even when delivery throws (e.g. agent not registered)", async () => {
    const registry = new PeerRegistry(); // no agent registered at routeTo
    const { client } = makeOutboundClient();

    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry,
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "POST", body: textWebhook() },
    );

    expect(res.status).toBe(200);
  });

  it("returns 405 for unsupported HTTP methods", async () => {
    const { client } = makeOutboundClient();
    const res = await handleWebhook(
      {
        verifyToken: "SECRET",
        registry: new PeerRegistry(),
        outboundClient: client,
        routeTo: "safevoice/triage",
      },
      { method: "PUT" },
    );
    expect(res.status).toBe(405);
  });
});
