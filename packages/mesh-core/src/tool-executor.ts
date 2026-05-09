import type { ToolCall, ToolResult } from "./tool.js";

/**
 * Executes tool calls returned by the LLM.
 *
 * Implementations map tool names to actual functions. The Agent calls
 * `execute()` for each tool call, feeds the results back to the LLM,
 * and repeats until the LLM produces a final text response.
 */
export interface ToolExecutor {
  execute(call: ToolCall): Promise<ToolResult>;
}

/**
 * A ToolExecutor backed by a registry of handler functions.
 * Register handlers with `register(name, fn)` or pass a map to the constructor.
 */
export class ToolRegistry implements ToolExecutor {
  private readonly handlers = new Map<string, (args: Record<string, unknown>) => Promise<string>>();

  constructor(handlers?: Record<string, (args: Record<string, unknown>) => Promise<string>>) {
    if (handlers) {
      for (const [name, fn] of Object.entries(handlers)) {
        this.handlers.set(name, fn);
      }
    }
  }

  register(name: string, handler: (args: Record<string, unknown>) => Promise<string>): void {
    this.handlers.set(name, handler);
  }

  async execute(call: ToolCall): Promise<ToolResult> {
    const handler = this.handlers.get(call.name);
    if (!handler) {
      return { toolCallId: call.id, content: `Unknown tool: ${call.name}`, error: true };
    }
    try {
      const content = await handler(call.arguments);
      return { toolCallId: call.id, content };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { toolCallId: call.id, content: `Tool error: ${message}`, error: true };
    }
  }
}
