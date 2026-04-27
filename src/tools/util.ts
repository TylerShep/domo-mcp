import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

/** Wrap any value as a CallToolResult JSON text block. */
export function jsonResult(value: unknown): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

export function textResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

export function errorResult(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    isError: true,
    content: [{ type: "text", text: message }],
  };
}

/**
 * Wrap a tool handler so any thrown error becomes a structured error result.
 * Lets us avoid try/catch boilerplate in every tool.
 */
export function safeTool<TArgs>(
  fn: (args: TArgs) => Promise<CallToolResult> | CallToolResult,
): (args: TArgs) => Promise<CallToolResult> {
  return async (args: TArgs) => {
    try {
      return await fn(args);
    } catch (err) {
      return errorResult(err);
    }
  };
}
