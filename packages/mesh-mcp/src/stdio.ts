import type { JsonRpcMessage, McpTransport } from "./types.js";

/**
 * Stdio transport per the MCP spec. Each line on stdin is one JSON-RPC
 * message; replies go as single-line JSON to stdout. Stderr is free for
 * logging (MCP clients do not interpret it).
 */
export const stdioTransport = (): McpTransport => {
  const buffers: string[] = [];

  return {
    read(onMessage) {
      process.stdin.setEncoding("utf8");
      process.stdin.on("data", (chunk: string) => {
        buffers.push(chunk);
        const combined = buffers.join("");
        buffers.length = 0;

        const lines = combined.split("\n");
        const trailing = lines.pop() ?? "";
        if (trailing.length > 0) {
          buffers.push(trailing);
        }

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length === 0) continue;
          try {
            onMessage(JSON.parse(trimmed) as JsonRpcMessage);
          } catch {
            // Malformed JSON lines are silently ignored — we cannot reply
            // without a message id, and crashing the server would be worse.
          }
        }
      });
    },
    write(msg) {
      process.stdout.write(`${JSON.stringify(msg)}\n`);
    },
    close() {
      process.stdin.removeAllListeners();
    },
  };
};
