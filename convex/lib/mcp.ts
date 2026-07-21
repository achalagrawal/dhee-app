import { DEFAULT_MD_MCP_URL } from "../config";

// Minimal MCP client over Streamable HTTP.
//
// The MD server runs stateless — no session handshake, no Mcp-Session-Id — so a
// single JSON-RPC POST per call is enough. Responses come back SSE-framed even
// for one-shot calls, hence the data-line parsing below. Using fetch directly
// rather than @modelcontextprotocol/sdk keeps this in Convex's default V8
// runtime instead of forcing "use node".

type JsonRpcResponse = {
  result?: {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  error?: { code: number; message: string };
};

function parseSsePayload(body: string): JsonRpcResponse {
  const dataLines = body
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter((line) => line.length > 0);

  const payload = dataLines[dataLines.length - 1];
  if (!payload) {
    throw new Error(
      `MCP returned no data frame. Raw body: ${body.slice(0, 200)}`,
    );
  }
  return JSON.parse(payload) as JsonRpcResponse;
}

export async function callMcpTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const url = process.env.MD_MCP_URL ?? DEFAULT_MD_MCP_URL;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
  });

  if (!response.ok) {
    throw new Error(`MCP ${toolName} failed: HTTP ${response.status}`);
  }

  const parsed = parseSsePayload(await response.text());
  if (parsed.error) {
    throw new Error(`MCP ${toolName} error: ${parsed.error.message}`);
  }

  const text = (parsed.result?.content ?? [])
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");

  return text || "No results found.";
}
