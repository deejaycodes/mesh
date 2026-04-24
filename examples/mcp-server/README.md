# MCP Server Example

> Expose a Corelay Mesh agent as an MCP tool for Claude Desktop, Cursor, or ChatGPT.

## Run

```bash
OPENAI_API_KEY=sk-... npm start
```

The server runs on stdio (the MCP wire protocol). It exposes one tool: `ask-assistant`.

## Connect from Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mesh-assistant": {
      "command": "npx",
      "args": ["tsx", "path/to/examples/mcp-server/src/index.ts"],
      "env": { "OPENAI_API_KEY": "sk-..." }
    }
  }
}
```

Restart Claude Desktop. The `ask-assistant` tool appears in the tool list. Claude can now call your Mesh agent.

## What this demonstrates

- `mcpToolFromAgent()` wraps any Mesh Agent as an MCP tool in one line
- `McpServer` handles the JSON-RPC protocol (initialize, tools/list, tools/call)
- `stdioTransport()` provides the wire layer
- Zero external MCP dependencies — the protocol is implemented directly
