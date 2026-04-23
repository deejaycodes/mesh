import { describe, it, expect } from "vitest";
import { parseWebhookBody, toMessage } from "../src/parser.js";

// A realistic slimmed-down Meta Cloud API webhook payload for a text message.
const textWebhook = (overrides: {
  from?: string;
  body?: string;
  id?: string;
  phoneNumberId?: string;
  timestamp?: string;
  type?: string;
} = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          value: {
            messaging_product: "whatsapp",
            metadata: {
              display_phone_number: "+442012345678",
              phone_number_id: overrides.phoneNumberId ?? "PNID_123",
            },
            contacts: [{ wa_id: overrides.from ?? "447911123456" }],
            messages: [
              {
                from: overrides.from ?? "447911123456",
                id: overrides.id ?? "wamid.abc",
                timestamp: overrides.timestamp ?? "1714200000",
                type: overrides.type ?? "text",
                ...(overrides.type === "image"
                  ? { image: { id: "media-id" } }
                  : { text: { body: overrides.body ?? "hello" } }),
              },
            ],
          },
          field: "messages",
        },
      ],
    },
  ],
});

describe("parseWebhookBody", () => {
  it("extracts a single text message", () => {
    const out = parseWebhookBody(textWebhook());

    expect(out).toHaveLength(1);
    expect(out[0]).toEqual({
      from: "447911123456",
      text: "hello",
      messageId: "wamid.abc",
      phoneNumberId: "PNID_123",
      receivedAt: 1714200000 * 1000,
    });
  });

  it("skips non-text messages (e.g. image)", () => {
    const out = parseWebhookBody(textWebhook({ type: "image" }));
    expect(out).toEqual([]);
  });

  it("returns an empty array for malformed payloads", () => {
    expect(parseWebhookBody(null)).toEqual([]);
    expect(parseWebhookBody("string")).toEqual([]);
    expect(parseWebhookBody({})).toEqual([]);
    expect(parseWebhookBody({ entry: "not an array" })).toEqual([]);
    expect(parseWebhookBody({ entry: [{ changes: [{ value: {} }] }] })).toEqual([]);
  });

  it("parses multiple messages across multiple entries", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "P1" },
                messages: [
                  { from: "111", id: "m-1", timestamp: "1000", type: "text", text: { body: "a" } },
                  { from: "222", id: "m-2", timestamp: "2000", type: "text", text: { body: "b" } },
                ],
              },
            },
          ],
        },
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "P2" },
                messages: [
                  { from: "333", id: "m-3", timestamp: "3000", type: "text", text: { body: "c" } },
                ],
              },
            },
          ],
        },
      ],
    };
    const out = parseWebhookBody(body);
    expect(out.map((p) => p.text)).toEqual(["a", "b", "c"]);
    expect(out.map((p) => p.from)).toEqual(["111", "222", "333"]);
    expect(out[0]?.phoneNumberId).toBe("P1");
    expect(out[2]?.phoneNumberId).toBe("P2");
  });

  it("skips messages missing required fields", () => {
    const body = {
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  // missing from
                  { id: "m-1", type: "text", text: { body: "x" } },
                  // missing id
                  { from: "1", type: "text", text: { body: "x" } },
                  // empty text body
                  { from: "1", id: "m-2", type: "text", text: { body: "" } },
                  // missing text entirely
                  { from: "1", id: "m-3", type: "text" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(parseWebhookBody(body)).toEqual([]);
  });

  it("falls back to now() when timestamp is missing or unparseable", () => {
    const before = Date.now();
    const out = parseWebhookBody({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [{ from: "1", id: "m-1", type: "text", text: { body: "hi" } }],
              },
            },
          ],
        },
      ],
    });
    const after = Date.now();
    expect(out).toHaveLength(1);
    expect(out[0]!.receivedAt).toBeGreaterThanOrEqual(before);
    expect(out[0]!.receivedAt).toBeLessThanOrEqual(after);
  });
});

describe("toMessage", () => {
  it("builds a Message with the whatsapp/ prefix and whatsapp metadata", () => {
    const parsed = {
      from: "447911123456",
      text: "hello",
      messageId: "wamid.abc",
      phoneNumberId: "PNID_123",
      receivedAt: 1_714_200_000_000,
    };
    const message = toMessage(parsed, "safevoice/triage", "trace-1");

    expect(message).toEqual({
      id: "wamid.abc",
      from: "whatsapp/447911123456",
      to: "safevoice/triage",
      kind: "user",
      content: "hello",
      traceId: "trace-1",
      createdAt: 1_714_200_000_000,
      metadata: { whatsapp: { phoneNumberId: "PNID_123" } },
    });
  });

  it("omits metadata when phoneNumberId is absent", () => {
    const parsed = {
      from: "447911123456",
      text: "hello",
      messageId: "wamid.abc",
      receivedAt: 0,
    };
    const message = toMessage(parsed, "safevoice/triage", "trace-1");
    expect(message.metadata).toBeUndefined();
  });
});
