import { isIP } from "node:net";

const WINDOW_SECONDS = 60;
const GLOBAL_LIMIT = 300;
const LOCAL_LIMIT = 600;
// One global bucket across instances; no IP, user, question or request data.
// Atomic increment and expiry prevent races between serverless workers.
const SCRIPT = "local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n";
type Outcome = "allow" | "limited" | "unavailable";
type Config = Record<string, string | undefined>;
type Options = { env?: Config; fetcher?: typeof fetch; now?: () => number };
export function createRateLimiter(options: Options = {}) {
  let start = 0;
  let count = 0;
  return async function admit(host: string): Promise<Outcome> {
    const env = options.env ?? process.env;
    if (env.ISNAD_MCP_LIMIT_MODE === "local") {
      // Never permit local-only enforcement on a non-loopback host.
      const hostname = host.split(":")[0];
      if (hostname !== "localhost" && !(isIP(hostname) === 4 && hostname.startsWith("127."))) return "unavailable";
      const now = (options.now ?? Date.now)();
      if (count === 0 || now - start >= WINDOW_SECONDS * 1000 || now < start) { start = now; count = 0; }
      if (count >= LOCAL_LIMIT) return "limited";
      count++;
      return "allow";
    }
    if (env.ISNAD_MCP_LIMIT_MODE !== "redis") return "unavailable";
    const token = env.ISNAD_MCP_REDIS_TOKEN;
    const namespace = env.ISNAD_MCP_LIMIT_NAMESPACE;
    if (!token || !namespace || !/^[a-z0-9-]{1,40}$/.test(namespace)) return "unavailable";
    try {
      const url = new URL(env.ISNAD_MCP_REDIS_URL ?? "");
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
          url.pathname !== "/" || !url.hostname.endsWith(".upstash.io")) return "unavailable";
      const response = await (options.fetcher ?? fetch)(url, {
        method: "POST", redirect: "error", cache: "no-store",
        headers: { authorization: "Bearer " + token, "content-type": "application/json" },
        body: JSON.stringify(["EVAL", SCRIPT, "1", "isnad:mcp:" + namespace + ":global", String(WINDOW_SECONDS)]),
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return "unavailable";
      const body: unknown = await response.json();
      if (typeof body !== "object" || body === null || !("result" in body) ||
          typeof body.result !== "number" || !Number.isSafeInteger(body.result) || body.result < 1) return "unavailable";
      return body.result > GLOBAL_LIMIT ? "limited" : "allow";
    } catch { return "unavailable"; }
  };
}
export const admitMcpRequest = createRateLimiter();
