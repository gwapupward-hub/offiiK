import { getSkill, REGISTRY_VERSION, resources, tools } from "@/lib/mcp/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const versions = ["2025-11-25", "2025-06-18", "2025-03-26"];
const maxBytes = 8192;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
type Dict = Record<string, unknown>;
const object = (value: unknown): value is Dict => typeof value === "object" && value !== null && !Array.isArray(value);
const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  json({ jsonrpc: "2.0", id, error: { code, message } }, status);
const result = (id: unknown, value: unknown) => json({ jsonrpc: "2.0", id, result: value });
function guard(request: Request): Response | undefined {
  if (process.env.ISNAD_MCP_ENABLED !== "true") return new Response(null, { status: 404, headers });
  const origin = request.headers.get("origin");
  // Native clients omit Origin; browser-origin calls require an explicit operator allowlist.
  if (origin !== null && (!process.env.ISNAD_MCP_ALLOWED_ORIGIN || origin !== process.env.ISNAD_MCP_ALLOWED_ORIGIN)) {
    return new Response(null, { status: 403, headers });
  }
  return undefined;
}
async function readBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RangeError("Body too large");
      }
      chunks.push(value);
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } finally {
    reader.releaseLock();
  }
}
export function GET(request: Request) {
  return guard(request) ?? new Response(null, { status: 405, headers: { ...headers, Allow: "POST" } });
}
export function DELETE(request: Request) {
  return GET(request);
}
export async function POST(request: Request) {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    return new Response(null, { status: 415, headers });
  }
  const accept = request.headers.get("accept")?.toLowerCase() ?? "";
  if (!accept.includes("application/json") || !accept.includes("text/event-stream")) {
    return new Response(null, { status: 406, headers });
  }
  const protocol = request.headers.get("mcp-protocol-version");
  if (protocol && !versions.includes(protocol)) return rpcError(null, -32600, "Unsupported protocol version", 400);
  let body: unknown;
  try { body = await readBody(request); }
  catch (error) { return rpcError(null, -32700, "Invalid or oversized JSON", error instanceof RangeError ? 413 : 400); }
  if (!object(body) || body.jsonrpc !== "2.0" || typeof body.method !== "string" ||
    ("id" in body && typeof body.id !== "string" && (typeof body.id !== "number" || !Number.isSafeInteger(body.id)))) {
    return rpcError(null, -32600, "Invalid request", 400);
  }
  if (!("id" in body)) return new Response(null, { status: 202, headers });
  const { id, method } = body;
  const params = body.params === undefined ? {} : body.params;
  if (!object(params)) return rpcError(id, -32602, "Invalid parameters");
  try {
    switch (method) {
      case "initialize":
        if (typeof params.protocolVersion !== "string" || !object(params.capabilities) || !object(params.clientInfo) ||
          typeof params.clientInfo.name !== "string" || typeof params.clientInfo.version !== "string") {
          return rpcError(id, -32602, "Invalid initialization");
        }
        return result(id, {
          protocolVersion: versions.includes(params.protocolVersion) ? params.protocolVersion : versions[0],
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: "isnad-mcp", version: REGISTRY_VERSION },
          instructions: "Read-only educational skill delivery. No question processing or verified evidence service. Core governs all specialists; host policies take precedence.",
        });
      case "ping": return result(id, {});
      case "tools/list": return result(id, { tools });
      case "resources/list": return result(id, { resources });
      case "resources/templates/list": return result(id, { resourceTemplates: [] });
      case "tools/call": {
        if (typeof params.name !== "string" ||
          (params.arguments !== undefined && (!object(params.arguments) || Object.keys(params.arguments).length !== 0))) {
          return rpcError(id, -32602, "Tool accepts no arguments");
        }
        const text = getSkill(params.name);
        if (!text) return rpcError(id, -32602, "Unknown skill");
        return result(id, { content: [{ type: "text", text }] });
      }
      case "resources/read": {
        const resource = resources.find(entry => entry.uri === params.uri);
        if (!resource) return rpcError(id, -32602, "Unknown resource");
        const text = getSkill(resource.name);
        if (!text) return rpcError(id, -32603, "Resource unavailable");
        return result(id, { contents: [{ uri: resource.uri, mimeType: resource.mimeType, text }] });
      }
      default: return rpcError(id, -32601, "Method not found");
    }
  } catch {
    return rpcError(id, -32603, "Skill unavailable");
  }
}
