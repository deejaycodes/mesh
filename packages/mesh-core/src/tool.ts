/**
 * A Tool is a named function an Agent can invoke to take action in the world
 * or fetch information.
 *
 * A tool declaration describes the function's shape to the LLM. Execution is
 * handled separately by a ToolExecutor (added in a later commit).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema object describing the tool's arguments. */
  parameters: Record<string, unknown>;
}

/**
 * An invocation of a tool by the LLM.
 */
export interface ToolCall {
  /** LLM-assigned id, used to pair a call with its result. */
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * The result of executing a tool call.
 */
export interface ToolResult {
  /** Matches the ToolCall.id. */
  toolCallId: string;
  /** String result — structured data can be JSON-encoded. */
  content: string;
  /** True if the tool returned an error. */
  error?: boolean;
}
