/**
 * MCP server example — expose a Mesh agent as a tool for Claude Desktop.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npm start
 *
 * Then in Claude Desktop's config (~/Library/Application Support/Claude/claude_desktop_config.json):
 *   {
 *     "mcpServers": {
 *       "mesh-assistant": {
 *         "command": "node",
 *         "args": ["path/to/examples/mcp-server/src/index.ts"]
 *       }
 *     }
 *   }
 */
import OpenAI from "openai";
import {
  Agent,
  MemoryInbox,
  PeerRegistry,
  type AgentConfig,
} from "@corelay/mesh-core";
import { LLMRouter, OpenAIClient } from "@corelay/mesh-llm";
import { McpServer, stdioTransport, mcpToolFromAgent } from "@corelay/mesh-mcp";

const CALLER = "mcp/caller" as const;
const AGENT = "demo/assistant" as const;

const buildLLM = () => {
  if (!process.env.OPENAI_API_KEY) {
    console.error("Set OPENAI_API_KEY to run this example.");
    process.exit(1);
  }
  const openai = new OpenAIClient({
    client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
  });
  return new LLMRouter({ primary: openai.name, providers: [openai] });
};

const main = async () => {
  const llm = buildLLM();
  const registry = new PeerRegistry();

  const config: AgentConfig = {
    name: "assistant",
    description: "A helpful assistant exposed via MCP.",
    prompt: "You are a concise, helpful assistant. Keep replies under 100 words.",
    model: "gpt-4o-mini",
    maxResponseTokens: 300,
    welcomeMessage: "",
    guardrails: "",
    tools: [],
    capabilities: [{ kind: "peer", address: CALLER }],
  };

  const agent = new Agent(AGENT, config, llm, new MemoryInbox(), registry);
  registry.register(agent);
  await agent.start();

  const tool = mcpToolFromAgent({
    name: "ask-assistant",
    description: "Ask the Mesh assistant a question. Returns a text reply.",
    registry,
    agentAddress: AGENT,
    callerAddress: CALLER,
  });

  const server = new McpServer({
    info: { name: "mesh-assistant", version: "0.1.0" },
    tools: [tool],
    transport: stdioTransport(),
  });

  server.start();
  console.error("MCP server running on stdio. Connect from Claude Desktop or Cursor.");
};

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
