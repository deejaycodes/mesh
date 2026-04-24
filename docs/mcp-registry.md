# MCP Registry Listing

## How to list Corelay Mesh on the MCP registry

The MCP registry at [modelcontextprotocol.io](https://modelcontextprotocol.io) lists servers that Claude Desktop, Cursor, and other MCP clients can discover.

### Submission

Submit via the [MCP servers repository](https://github.com/modelcontextprotocol/servers):

1. Fork `modelcontextprotocol/servers`
2. Add an entry to the servers list:

```json
{
  "name": "corelay-mesh",
  "description": "Expose Corelay Mesh agents as MCP tools. Any agent in a PeerRegistry becomes callable by Claude Desktop, Cursor, or ChatGPT.",
  "repository": "https://github.com/corelay-dev/mesh",
  "package": "@corelay/mesh-mcp",
  "transport": "stdio",
  "categories": ["ai-agents", "multi-agent", "orchestration"]
}
```

3. Open a PR with the entry.

### Client configuration

Users add this to their Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "corelay-mesh": {
      "command": "node",
      "args": ["path/to/your/mcp-server.js"]
    }
  }
}
```

### Status

- [ ] PR submitted to modelcontextprotocol/servers
- [ ] Listed on modelcontextprotocol.io
- [ ] Tested with Claude Desktop
- [ ] Tested with Cursor
