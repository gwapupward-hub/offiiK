import { createIsnadHandler } from "@/lib/mcp/sdk";
import { admitMcpRequest } from "@/lib/mcp/rateLimit";
import { acquireMcpConcurrency } from "@/lib/mcp/concurrency";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 25;
const maxBytes = 8192;
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
let handler: ReturnType<typeof createIsnadHandler> | undefined;
let active = 0;
const maxActive = 8;

function guard(request: Request): Response | undefined {
  if (process.env.ISNAD_MCP_ENABLED !== "true") return new Response(null, { status: 404, headers });
  // Exact operator-configured ingress host, including a port for local testing.
  // Next.js can reconstruct request.url with an internal hostname. Validate the actual
  // HTTP Host header, not that reconstructed URL or any forwarded headers.
  const host = process.env.ISNAD_MCP_ALLOWED_HOST;
  if (!host || request.headers.get("host") !== host) {
    return new Response(null, { status: 403, headers });
  }
  const origin = request.headers.get("origin");
  if (origin !== null && (!process.env.ISNAD_MCP_ALLOWED_ORIGIN || origin !== process.env.ISNAD_MCP_ALLOWED_ORIGIN)) {
    return new Response(null, { status: 403, headers });
  }
  return undefined;
}

async function boundedRequest(request: Request): Promise<Request | Response> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") return new Response(null, { status: 415, headers });
  const sizeHeader = request.headers.get("content-length");
  if (sizeHeader !== null && (!/^\d+$/.test(sizeHeader) || Number(sizeHeader) > maxBytes)) {
    return new Response(null, { status: 413, headers });
  }
  const reader = request.body?.getReader();
  if (!reader) return new Response(null, { status: 400, headers });
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("body_timeout")), 5000);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        void reader.cancel().catch(() => {});
        return new Response(null, { status: 413, headers });
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const cleanHeaders = new Headers(request.headers);
    cleanHeaders.delete("content-length");
    return new Request(request.url, { method: request.method, headers: cleanHeaders, body: bytes, signal: request.signal });
  } catch {
    void reader.cancel().catch(() => {});
    return new Response(null, { status: 408, headers });
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

async function boundedResponse(response: Response): Promise<ArrayBuffer | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("response_timeout")), 10000);
    });
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) break;
      size += value.byteLength;
      if (size > 512 * 1024) throw Error("response_too_large");
      chunks.push(value);
    }
    const buffer = new ArrayBuffer(size);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return buffer;
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    reader.releaseLock();
  }
}

async function serve(request: Request): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  if (active >= maxActive) return new Response(null, { status: 503, headers: { ...headers, "Retry-After": "1" } });
  active++;
  let release: (() => Promise<void>) | undefined;
  try {
    if (process.env.ISNAD_MCP_LIMIT_MODE === "redis" && process.env.ISNAD_MCP_INGRESS_VERIFIED !== "true") return new Response(null, { status: 503, headers });
    const admitted = await admitMcpRequest(request.headers.get("host") ?? "");
    if (admitted === "limited") return new Response(null, { status: 429, headers: { ...headers, "Retry-After": "60" } });
    if (admitted !== "allow") return new Response(null, { status: 503, headers });
    const lease = await acquireMcpConcurrency();
    if (lease.status !== "allow") return new Response(null, { status: 503, headers: { ...headers, "Retry-After": "1" } });
    release = lease.release;
    const input = request.method === "POST" ? await boundedRequest(request) : request;
    if (input instanceof Response) return input;
    handler ??= createIsnadHandler();
    const response = await (await handler).fetch(input);
    const safeHeaders = new Headers(response.headers);
    for (const [name, value] of Object.entries(headers)) safeHeaders.set(name, value);
    // This read-only service serves finite results; bound egress before releasing the lease.
    const bytes = await boundedResponse(response);
    safeHeaders.delete("content-length");
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers: safeHeaders });
  } catch {
    handler = undefined;
    return new Response(null, { status: 503, headers });
  } finally {
    try { await release?.(); } finally { active--; }
  }
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
