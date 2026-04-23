import type { Address, PeerRegistry } from "@corelay/mesh-core";
import { parseWebhookBody, toMessage } from "./parser.js";
import { userPeer, type WhatsAppClient } from "./client.js";

export interface HandleWebhookConfig {
  /** Shared verify token Meta sends during webhook subscription. */
  verifyToken: string;
  /** Registry to deliver inbound Messages through. */
  registry: PeerRegistry;
  /** Outbound client used when auto-registering UserPeers on first contact. */
  outboundClient: WhatsAppClient;
  /** Address inbound Messages are routed to (typically an agent's). */
  routeTo: Address;
  /** Optional: build a traceId per inbound. Default: a new random uuid. */
  makeTraceId?: (inbound: { from: string; messageId: string }) => string;
}

export interface WebhookRequest {
  method: string;
  /** Parsed JSON body. Caller is responsible for parsing. */
  body?: unknown;
  /** Parsed URL query string. */
  query?: Record<string, string | string[] | undefined>;
}

export interface WebhookResponse {
  status: number;
  body?: string;
  contentType?: string;
}

/**
 * Framework-agnostic webhook handler.
 *
 * - `GET` with `hub.mode=subscribe` performs the Meta subscription
 *   challenge: returns 200 with `hub.challenge` if the verify token
 *   matches, 403 otherwise.
 * - `POST` parses the body, auto-registers a UserPeer for each new
 *   sender, delivers each inbound as a Message, and returns 200 with
 *   an empty body — always, even if parsing failed. Meta must see
 *   200 or it retries.
 *
 * Returns a `WebhookResponse` so callers can wire into any framework
 * (Express, Fastify, Remix, raw http.createServer).
 */
export const handleWebhook = async (
  config: HandleWebhookConfig,
  request: WebhookRequest,
): Promise<WebhookResponse> => {
  if (request.method === "GET") return verify(config.verifyToken, request.query ?? {});
  if (request.method === "POST") return receive(config, request.body);
  return { status: 405 };
};

const verify = (
  verifyToken: string,
  query: Record<string, string | string[] | undefined>,
): WebhookResponse => {
  const mode = first(query["hub.mode"]);
  const token = first(query["hub.verify_token"]);
  const challenge = first(query["hub.challenge"]);

  if (mode === "subscribe" && token === verifyToken && challenge !== undefined) {
    return { status: 200, body: challenge, contentType: "text/plain" };
  }
  return { status: 403 };
};

const receive = async (
  config: HandleWebhookConfig,
  body: unknown,
): Promise<WebhookResponse> => {
  const inbounds = parseWebhookBody(body);

  await Promise.all(
    inbounds.map(async (inbound) => {
      const senderAddress: Address = `whatsapp/${inbound.from}` as Address;

      // Auto-register a UserPeer for this sender on first contact. A
      // subsequent inbound from the same user reuses the existing peer.
      if (!config.registry.has(senderAddress)) {
        config.registry.register(
          userPeer({ address: senderAddress, client: config.outboundClient }),
        );
      }

      const traceId = config.makeTraceId
        ? config.makeTraceId({ from: inbound.from, messageId: inbound.messageId })
        : crypto.randomUUID();

      const message = toMessage(inbound, config.routeTo, traceId);

      try {
        await config.registry.deliver(message);
      } catch {
        // Swallow — we still ACK Meta. A failed delivery surfaces through
        // Mesh's tracing, not through HTTP status. Handler logging is the
        // caller's job.
      }
    }),
  );

  // Always 200 — Meta retries on any non-2xx, which causes duplicate
  // deliveries and runaway cost.
  return { status: 200 };
};

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;
