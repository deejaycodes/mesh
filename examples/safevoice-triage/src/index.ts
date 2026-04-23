/**
 * SafeVoice triage example — end-to-end demo.
 *
 * Two scenarios:
 *
 *   npm start            # normal-risk: triage → hierarchy → critic → WhatsApp
 *   npm start:high-risk  # high-risk:   triage → caseworker (HumanPeer)
 *
 * Both scenarios print the OTel span tree to stdout and the simulated
 * WhatsApp outbound payloads they produced.
 */
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OTelTracer } from "@corelay/mesh-observe";
import type { Address } from "@corelay/mesh-core";

import { buildSafeVoiceTriage, SV } from "./mesh.js";
import { buildSimulatedHarness } from "./harness.js";
import {
  CASEWORKER,
  isHighRisk,
  registerCaseworker,
} from "./high-risk.js";

const USER_PHONE = "447911123456";
const USER_ADDRESS = `whatsapp/${USER_PHONE}` as Address;

const setupTracing = () => {
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  trace.setGlobalTracerProvider(provider);

  return {
    tracer: new OTelTracer({ name: "@mesh-examples/safevoice-triage" }),
    shutdown: () => provider.shutdown(),
  };
};

const runNormalRisk = async () => {
  const { tracer, shutdown } = setupTracing();

  const { registry } = buildSafeVoiceTriage({
    tracer,
    forwardTo: USER_ADDRESS,
  });

  const harness = buildSimulatedHarness({
    registry,
    routeTo: SV.manager,
    traceId: "demo-normal",
  });

  const userMessage =
    "I'm worried about my safety at home. What should I do to stay safe this week?";
  console.log(`\n[user → +${USER_PHONE}] ${userMessage}\n`);

  await harness.inbound({ from: USER_PHONE, text: userMessage });

  // Wait for the mesh to finish delivering the reply.
  await waitUntil(() => harness.outbound.length > 0, 30_000);
  await shutdown();

  console.log("\n=== WhatsApp outbound captured ===");
  for (const out of harness.outbound) {
    console.log(`[mesh → +${out.to}] ${out.text}`);
  }
};

const runHighRisk = async () => {
  const { tracer, shutdown } = setupTracing();

  const { registry } = buildSafeVoiceTriage({
    tracer,
    forwardTo: USER_ADDRESS,
  });

  const caseworker = await registerCaseworker({ registry, tracer });

  const harness = buildSimulatedHarness({
    registry,
    routeTo: SV.manager, // default
    traceId: "demo-high-risk",
  });

  const userMessage = "He's here right now. Please help me.";
  console.log(`\n[user → +${USER_PHONE}] ${userMessage}\n`);

  if (!isHighRisk(userMessage)) {
    throw new Error("Expected high-risk classification for the demo input.");
  }

  // Reroute: in a real deployment this is where the classifier hooks in
  // ahead of handleWebhook. For the example we'll bypass the manager and
  // deliver straight to the caseworker.
  await harness.inbound({ from: USER_PHONE, text: userMessage });
  // Undo the route — the simulated inbound always targets the manager;
  // for this scenario we pretend the classifier intercepted instead.
  // To keep the demo honest, we manually redeliver to the caseworker.
  // (A production harness would support a per-event routeTo override;
  // keeping it simple in the example.)
  await registry.deliver({
    id: `caseworker-${Date.now()}`,
    from: USER_ADDRESS,
    to: CASEWORKER,
    kind: "user",
    content: userMessage,
    traceId: "demo-high-risk",
    createdAt: Date.now(),
  });

  // Wait for the caseworker's worklist to have an item.
  await waitUntil(() => caseworker.list().length > 0, 5_000);
  const pending = caseworker.list();
  console.log(
    `\n=== Caseworker worklist (${pending.length} pending) ===`,
  );
  for (const item of pending) {
    console.log(`- [${item.id}] from ${item.message.from}: ${item.message.content}`);
  }

  // Simulate the caseworker acting.
  const firstItem = pending[0]!;
  console.log(`\n[caseworker → respond edit] on ${firstItem.id}\n`);
  await caseworker.respond(firstItem.id, {
    decision: "edit",
    actor: "alice@safevoice",
    content:
      "I'm with you. If he is in the house right now and you can call without him hearing, dial 999. If you can't talk, press 55 after the call connects — that tells the operator you need help. I'll stay here.",
  });

  await waitUntil(() => harness.outbound.length > 0, 5_000);
  await shutdown();

  console.log("\n=== WhatsApp outbound captured ===");
  for (const out of harness.outbound) {
    console.log(`[mesh → +${out.to}] ${out.text}`);
  }
};

const waitUntil = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`waitUntil timeout after ${timeoutMs}ms`);
    await new Promise((r) => setTimeout(r, 50));
  }
};

const main = async () => {
  const scenario = process.argv[2] ?? "normal";
  if (scenario === "high-risk") {
    await runHighRisk();
  } else {
    await runNormalRisk();
  }
};

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
