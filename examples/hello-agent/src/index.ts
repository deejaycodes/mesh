/**
 * hello-agent — the minimal Corelay Mesh end-to-end example.
 *
 * Uses @corelay/mesh-llm's LLMRouter to compose whichever providers the
 * caller has configured credentials for. Primary: OpenAI. Fallback: Anthropic.
 */
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  run,
  type AgentConfig,
  type LLMClient,
} from "@corelay/mesh-core";
import { AnthropicClient, LLMRouter, OpenAIClient } from "@corelay/mesh-llm";

const CALLER_ADDRESS = "demo/caller" as const;
const AGENT_ADDRESS = "demo/hello" as const;

const buildLLM = (): LLMClient => {
  const providers: LLMClient[] = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push(
      new OpenAIClient({
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      }),
    );
  }

  if (process.env.ANTHROPIC_API_KEY) {
    providers.push(
      new AnthropicClient({
        client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
      }),
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
  const llm = buildLLM();

  const agentConfig: AgentConfig = {
    name: "hello",
    description: "A friendly demo agent.",
    prompt: "You are a concise, friendly assistant. Keep replies under 50 words.",
    model: process.env.MODEL ?? "gpt-4o-mini",
    maxResponseTokens: 200,
    welcomeMessage: "Hello! Ask me anything.",
    guardrails: "",
    tools: [],
    capabilities: [{ kind: "peer", address: CALLER_ADDRESS }],
  };

  const registry = new PeerRegistry();
  const agent = new Agent(AGENT_ADDRESS, agentConfig, llm, new MemoryInbox(), registry);
  registry.register(agent);
  await agent.start();

  const question = process.argv[2] ?? "What's the capital of Nigeria?";
  console.log(`> ${question}`);

  const result = await run(registry, AGENT_ADDRESS, question, {
    from: CALLER_ADDRESS,
    timeoutMs: 30_000,
  });

  console.log(`< ${result.content}`);
  console.log(`  (traceId: ${result.traceId})`);
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
