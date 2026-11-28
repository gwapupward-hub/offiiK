import { randomUUID } from "node:crypto";

const ACQUIRE = "local t=redis.call('TIME'); local now=t[1]*1000+math.floor(t[2]/1000); redis.call('ZREMRANGEBYSCORE',KEYS[1],'-inf',now); if redis.call('ZCARD',KEYS[1])>=tonumber(ARGV[1]) then return 0 end; redis.call('ZADD',KEYS[1],now+tonumber(ARGV[2]),ARGV[3]); redis.call('PEXPIRE',KEYS[1],tonumber(ARGV[2])+1000); return 1";
const RELEASE = "return redis.call('ZREM',KEYS[1],ARGV[1])";
const LIMIT = 32;
const LEASE_MS = 30000;
type Result = { status: "allow"; release: () => Promise<void> } | { status: "limited" | "unavailable" };
type Options = { env?: Record<string,string|undefined>; fetcher?: typeof fetch; id?: () => string };

export function createConcurrencyLimiter(options: Options = {}) {
  return async function acquire(): Promise<Result> {
    const env = options.env ?? process.env;
    if (env.ISNAD_MCP_LIMIT_MODE === "local") return { status: "allow", release: async () => {} };
    const namespace = env.ISNAD_MCP_LIMIT_NAMESPACE;
    const token = env.ISNAD_MCP_REDIS_TOKEN;
    if (env.ISNAD_MCP_LIMIT_MODE !== "redis" || !token || !namespace || !/^[a-z0-9-]{1,40}$/.test(namespace)) return { status: "unavailable" };
    try {
      const url = new URL(env.ISNAD_MCP_REDIS_URL ?? "");
      if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash || url.pathname !== "/" || !url.hostname.endsWith(".upstash.io")) return { status: "unavailable" };
      const key = "isnad:mcp:" + namespace + ":leases";
      const leaseId = (options.id ?? randomUUID)();
      const command = async (script: string, args: string[]): Promise<number | undefined> => {
        try {
          const response = await (options.fetcher ?? fetch)(url, {
            method: "POST", redirect: "error", cache: "no-store",
            headers: { authorization: "Bearer " + token, "content-type": "application/json" },
            body: JSON.stringify(["EVAL", script, "1", key, ...args]),
            signal: AbortSignal.timeout(2000),
          });
          if (!response.ok) return undefined;
          const body: unknown = await response.json();
          if (typeof body !== "object" || body === null || !("result" in body) || typeof body.result !== "number") return undefined;
          return body.result;
        } catch { return undefined; }
      };
      const admitted = await command(ACQUIRE, [String(LIMIT), String(LEASE_MS), leaseId]);
      if (admitted === 0) return { status: "limited" };
      if (admitted !== 1) return { status: "unavailable" };
      let released = false;
      return { status: "allow", release: async () => {
        if (released) return;
        released = true;
        await command(RELEASE, [leaseId]); // TTL recovers failed or abandoned releases.
      } };
    } catch { return { status: "unavailable" }; }
  };
}
export const acquireMcpConcurrency = createConcurrencyLimiter();
