import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  type AgentConfig,
  type Address,
  type LLMClient,
} from "@corelay/mesh-core";
import {
  Critic,
  Hierarchy,
  LLMDecomposer,
  LLMMerger,
  managerPeer,
  withCritic,
  type HierarchyWorker,
} from "@corelay/mesh-coordination";
import { AnthropicClient, LLMRouter, OpenAIClient } from "@corelay/mesh-llm";
import type { Tracer } from "@corelay/mesh-observe";
import { triageConfig, safetyPlannerConfig, serviceFinderConfig } from "./agents.js";

/**
 * Stable addresses used throughout the example. Exported so the harness can
 * also deliver messages into the registry.
 */
export const SV = {
  manager: "safevoice/manager" as Address,
  collector: "safevoice/manager-collector" as Address,
  safetyPlanner: "safevoice/safety-planner" as Address,
  serviceFinder: "safevoice/service-finder" as Address,
  criticFor: (forwardTo: Address) => `safevoice/critic-for-${forwardTo}` as Address,
};

export interface SafeVoiceTriage {
  registry: PeerRegistry;
  llm: LLMClient;
}

export interface BuildOptions {
  /** Tracer passed into every instrumented primitive. Defaults to noop. */
  tracer?: Tracer;
  /** Forward address for the final reply (usually a whatsapp/<phone>). */
  forwardTo: Address;
  /** Model id used by all agents. */
  model?: string;
}

/**
 * Build the SafeVoice triage mesh.
 *
 *   inbound → managerPeer(safety-planner, service-finder)
 *           → merged reply
 *           → critic-peer (safeguarding rules)
 *           → forwardTo (typically whatsapp/<phone>)
 *
 * Returns the registry and the LLM so the caller can register its own
 * outbound peer (WhatsApp UserPeer, or a stub for demos).
 */
export const buildSafeVoiceTriage = (options: BuildOptions): SafeVoiceTriage => {
  const { tracer, forwardTo } = options;
  const model = options.model ?? process.env.MODEL ?? "gpt-4o-mini";

  const llm = buildLLMRouter();
  const registry = new PeerRegistry();

  const criticPeerAddress = SV.criticFor(forwardTo);

  // Worker agents — each reports back to the manager collector.
  const safetyPlanner = new Agent(
    SV.safetyPlanner,
    safetyPlannerConfig(model, SV.collector),
    llm,
    new MemoryInbox(),
    registry,
    tracer ? { tracer } : {},
  );
  const serviceFinder = new Agent(
    SV.serviceFinder,
    serviceFinderConfig(model, SV.collector),
    llm,
    new MemoryInbox(),
    registry,
    tracer ? { tracer } : {},
  );
  registry.register(safetyPlanner);
  registry.register(serviceFinder);

  const workers: HierarchyWorker[] = [
    { address: SV.safetyPlanner, role: "safety planner" },
    { address: SV.serviceFinder, role: "service finder" },
  ];

  // Manager: decomposes, fans out, merges. Forwards merged reply to the
  // critic-peer, not directly to the user.
  const hierarchy = new Hierarchy({
    workers,
    registry,
    decomposer: new LLMDecomposer({ llm, model, domain: "safeguarding triage" }),
    merger: new LLMMerger({ llm, model, domain: "safeguarding triage" }),
    traceId: "safevoice-triage",
    collectorAddress: SV.collector,
    timeoutMs: 30_000,
    ...(tracer !== undefined && { tracer }),
  });
  registry.register(
    managerPeer({
      address: SV.manager,
      hierarchy,
      forwardTo: criticPeerAddress,
      registry,
    }),
  );

  // Critic-peer: reviews the merged reply, forwards (maybe revised) to the
  // final recipient.
  const triageCfg: AgentConfig = triageConfig(model, criticPeerAddress);
  const critic = new Critic({
    llm,
    model,
    domain: "SafeVoice safeguarding triage on WhatsApp",
    guardrails: triageCfg.guardrails,
    ...(tracer !== undefined && { tracer }),
  });
  registry.register(
    withCritic({
      address: criticPeerAddress,
      forwardTo,
      critic,
      systemPrompt: triageCfg.prompt,
      registry,
    }),
  );

  return { registry, llm };
};

const buildLLMRouter = (): LLMClient => {
  const providers: LLMClient[] = [];
  if (process.env.OPENAI_API_KEY) {
    providers.push(
      new OpenAIClient({ client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) }),
    );
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push(
      new AnthropicClient({ client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) }),
    );
  }
  if (providers.length === 0) {
    throw new Error("Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY.");
  }
  const primary = providers[0]!.name;
  const fallbacks = providers.slice(1).map((p) => p.name);
  return new LLMRouter({ primary, fallbacks, providers });
};
