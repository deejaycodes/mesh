/**
 * traced-agent — hello-agent with OpenTelemetry tracing wired to the console.
 *
 * Same shape as examples/hello-agent, plus:
 *  - registers an AsyncLocalStorage context manager (required for nested
 *    spans to cross await boundaries)
 *  - registers a TracerProvider with a ConsoleSpanExporter
 *  - passes an OTelTracer to the Agent
 *
 * Run it, ask a question, see the span tree printed to stdout.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { context, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import {
  BasicTracerProvider,
  ConsoleSpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  run,
  type AgentConfig,
  type LLMClient,
} from "@corelay/mesh-core";
import { AnthropicClient, LLMRouter, OpenAIClient } from "@corelay/mesh-llm";
import { OTelTracer } from "@corelay/mesh-observe";

const CALLER_ADDRESS = "demo/caller" as const;
const AGENT_ADDRESS = "demo/hello" as const;

const setupTracing = () => {
  const contextManager = new AsyncLocalStorageContextManager();
  contextManager.enable();
  context.setGlobalContextManager(contextManager);

  const provider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(new ConsoleSpanExporter())],
  });
  trace.setGlobalTracerProvider(provider);

  return {
    tracer: new OTelTracer({ name: "@corelay/traced-agent" }),
    shutdown: () => provider.shutdown(),
  };
};

const buildLLM = (): LLMClient => {
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
    console.error("Set OPENAI_API_KEY and/or ANTHROPIC_API_KEY to run this example.");
    process.exit(1);
  }

  const primary = providers[0]!.name;
  const fallbacks = providers.slice(1).map((p) => p.name);
  return new LLMRouter({ primary, fallbacks, providers });
};

const main = async () => {
  const { tracer, shutdown } = setupTracing();
  const llm = buildLLM();

  const agentConfig: AgentConfig = {
    name: "hello",
    description: "A friendly demo agent (traced).",
    prompt: "You are a concise, friendly assistant. Keep replies under 50 words.",
    model: process.env.MODEL ?? "gpt-4o-mini",
    maxResponseTokens: 200,
    welcomeMessage: "Hello! Ask me anything.",
    guardrails: "",
    tools: [],
    capabilities: [{ kind: "peer", address: CALLER_ADDRESS }],
  };

  const registry = new PeerRegistry();
  const agent = new Agent(
    AGENT_ADDRESS,
    agentConfig,
    llm,
    new MemoryInbox(),
    registry,
    { tracer },
  );
  registry.register(agent);
  await agent.start();

  const question = process.argv[2] ?? "What's the capital of Nigeria?";
  console.log(`\n> ${question}\n`);

  const result = await run(registry, AGENT_ADDRESS, question, {
    from: CALLER_ADDRESS,
    timeoutMs: 30_000,
  });

  console.log(`\n< ${result.content}`);
  console.log(`  (traceId: ${result.traceId})\n`);

  // Flush pending spans before exiting so the console output isn't cut off.
  await shutdown();
};

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
