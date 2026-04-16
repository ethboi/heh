import "server-only";

const MCP_ENDPOINT = "https://mcp.trivago.com/mcp";
const MCP_PROTOCOL_VERSION = "2025-03-26";

type JsonRpcId = number | string | null;

type JsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: T;
};

type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse<T> = JsonRpcSuccess<T> | JsonRpcFailure;

type McpInitializeResult = {
  protocolVersion: string;
};

function isJsonRpcFailure<T>(response: JsonRpcResponse<T>): response is JsonRpcFailure {
  return "error" in response;
}

async function parseJsonRpcResponse<T>(response: Response): Promise<JsonRpcResponse<T>> {
  const raw = await response.text();

  try {
    return JSON.parse(raw) as JsonRpcResponse<T>;
  } catch {
    throw new Error(`Unable to parse MCP response as JSON: ${raw.slice(0, 300)}`);
  }
}

async function initializeSession(): Promise<string> {
  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: {
          name: "beat-this-price",
          version: "1.0.0",
        },
      },
    }),
    cache: "no-store",
  });

  const payload = await parseJsonRpcResponse<McpInitializeResult>(response);

  if (!response.ok) {
    throw new Error(`MCP initialize failed with status ${response.status}`);
  }

  if (isJsonRpcFailure(payload)) {
    throw new Error(`MCP initialize error: ${payload.error.message}`);
  }

  const sessionId =
    response.headers.get("mcp-session-id") ?? response.headers.get("Mcp-Session-Id");

  if (!sessionId) {
    throw new Error("MCP initialize succeeded but did not return Mcp-Session-Id header");
  }

  return sessionId;
}

export async function callMcpTool<T>(
  name: string,
  args: Record<string, unknown>
): Promise<T> {
  const sessionId = await initializeSession();

  const response = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Mcp-Session-Id": sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: {
        name,
        arguments: args,
      },
    }),
    cache: "no-store",
  });

  const payload = await parseJsonRpcResponse<T>(response);

  if (!response.ok) {
    throw new Error(`MCP tool call failed with status ${response.status}`);
  }

  if (isJsonRpcFailure(payload)) {
    throw new Error(`MCP tool call error: ${payload.error.message}`);
  }

  return payload.result;
}
