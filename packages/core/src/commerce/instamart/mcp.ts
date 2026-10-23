/**
 * The smallest MCP client WonderHome needs to talk to Swiggy's Instamart
 * server: JSON-RPC 2.0 over Streamable HTTP, `initialize` once per session,
 * then `tools/call`. A response may be plain JSON or a server-sent event
 * stream; both are read the same way.
 *
 * Every Swiggy tool answers `{ success, data, message }` or
 * `{ success: false, error: { message } }`, inside the MCP result's text
 * content (or `structuredContent`). This returns that envelope and nothing
 * else: no response body is logged or kept (Swiggy's data guidelines).
 */

export type ToolEnvelope = { success: true; data: unknown; message: string | null } | { success: false; error: string };

export class McpError extends Error {
  constructor(
    /** "unauthorized" means refresh the token, then sign in again; "rate_limited" carries Retry-After. */
    readonly code: "unauthorized" | "rate_limited" | "unreachable" | "protocol",
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(`instamart mcp: ${code}`);
  }
}

type Fetch = typeof fetch;

const PROTOCOL_VERSION = "2025-06-18";

export type McpSession = {
  callTool(name: string, args?: Record<string, unknown>, options?: { timeoutMs?: number }): Promise<ToolEnvelope>;
};

export function mcpSession(input: { endpoint: string; accessToken: string; fetch?: Fetch }): McpSession {
  const doFetch = input.fetch ?? fetch;
  let sessionId: string | null = null;
  let ready: Promise<void> | null = null;
  let nextId = 1;

  async function post(body: unknown, timeoutMs: number): Promise<{ response: Response; payload: unknown }> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${input.accessToken}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": PROTOCOL_VERSION,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;
    const response = await doFetch(input.endpoint, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs) }).catch(() => null);
    if (!response) throw new McpError("unreachable");
    if (response.status === 401 || response.status === 419) throw new McpError("unauthorized");
    if (response.status === 429) {
      const after = Number(response.headers.get("retry-after"));
      throw new McpError("rate_limited", Number.isFinite(after) && after > 0 ? after : null);
    }
    if (response.status === 202) return { response, payload: null };
    if (!response.ok) throw new McpError(response.status >= 500 ? "unreachable" : "protocol");
    const text = await response.text();
    const type = response.headers.get("content-type") ?? "";
    return { response, payload: type.includes("text/event-stream") ? lastEventData(text) : safeJson(text) };
  }

  async function initialize(): Promise<void> {
    const { response, payload } = await post(
      { jsonrpc: "2.0", id: nextId++, method: "initialize", params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "WonderHome", version: "1.0" } } },
      10_000,
    );
    const rpc = payload as { error?: { code?: number } } | null;
    if (rpc?.error?.code === -32001) throw new McpError("unauthorized");
    if (!payload || rpc?.error) throw new McpError("protocol");
    sessionId = response.headers.get("mcp-session-id");
    await post({ jsonrpc: "2.0", method: "notifications/initialized" }, 10_000);
  }

  return {
    async callTool(name, args = {}, options = {}) {
      ready ??= initialize();
      await ready;
      const { payload } = await post({ jsonrpc: "2.0", id: nextId++, method: "tools/call", params: { name, arguments: args } }, options.timeoutMs ?? 15_000);
      return toEnvelope(payload);
    },
  };
}

/** The tool's own envelope out of a JSON-RPC response. */
export function toEnvelope(payload: unknown): ToolEnvelope {
  const rpc = payload as { error?: { code?: number; message?: unknown }; result?: { isError?: boolean; structuredContent?: unknown; content?: { type?: string; text?: unknown }[] } } | null;
  if (rpc?.error?.code === -32001) throw new McpError("unauthorized");
  if (!rpc || rpc.error || !rpc.result) throw new McpError("protocol");
  const text = rpc.result.content?.find((part) => part.type === "text" && typeof part.text === "string")?.text as string | undefined;
  const inner = (rpc.result.structuredContent ?? (text ? safeJson(text) : null)) as { success?: unknown; data?: unknown; message?: unknown; error?: { message?: unknown } | string } | null;
  if (inner && inner.success === true) return { success: true, data: inner.data ?? null, message: typeof inner.message === "string" ? inner.message : null };
  if (inner && inner.success === false) {
    const message = typeof inner.error === "string" ? inner.error : typeof inner.error?.message === "string" ? inner.error.message : "failed";
    return { success: false, error: message.slice(0, 300) };
  }
  if (rpc.result.isError) return { success: false, error: (text ?? "failed").slice(0, 300) };
  // A tool that answers with bare data rather than the envelope.
  return { success: true, data: inner ?? text ?? null, message: null };
}

function lastEventData(stream: string): unknown {
  let last: unknown = null;
  for (const block of stream.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data) continue;
    const parsed = safeJson(data) as { id?: unknown } | null;
    // The response to our request carries an id; notifications in the stream do not.
    if (parsed && parsed.id !== undefined) last = parsed;
  }
  return last;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
