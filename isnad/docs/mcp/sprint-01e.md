# Sprint 01-E — Security and connection preparation

Status: isolated candidate, not authorized for public exposure.

## Previous integrated candidate

PR #48 head 03ee519efabac4a82846f57f7bfa5f2b9ccb5ae9: workflow 46127838669 passed SDK frozen install, audit, protocol and Skills wire tests, and local ZIP generation. Application frozen install, typecheck, 88/88 unit tests, build, and targeted lint passed. Actual HTTP client tests failed (legacy and modern both received 403). Next.js can reconstruct request URLs using internal hostnames. The patch validates the explicitly configured HTTP Host header instead of relying on request.url's host; this is a candidate fix, not a verified diagnosis. The proxy/hosting layer must enforce trusted ingress and prevent Host spoofing; never enable this route before platform testing.

## Security changes

- Default-off service; exact configured Host, exact optional Origin, no trust in forwarded host headers.
- Explicit rate limiter mode. Missing, misconfigured or unavailable limiter fails closed (503).
- Redis REST mode uses a single atomic INCR/EXPIRE script with one anonymous deployment-scoped bucket, capped at 300 requests per 60 seconds. No client IP, question or credential is written to the bucket. Upstash-compatible HTTPS endpoint is operator configured, redirects rejected, 2-second request deadline.
- Local-only mode requires an explicitly configured loopback Host and allows 600 requests per minute for QA. Do not expose a loopback-mode server through a reverse proxy or tunnel.
- Per-process admission concurrency cap of eight request handlers; this is not a distributed concurrency limit and does not cover streaming after response handoff.
- Body limit 8 KiB and five-second read deadline remain in effect.
- No Redis instance, credentials, DNS or production settings were created or modified. Tests mock the provider; live integration remains pending.
- Global limits alone permit monopolization by one client. A trusted ingress per-client quota, distributed concurrency/bandwidth controls, provider cost alerts and load tests are mandatory before public access.

## Environment contract

ISNAD_MCP_ENABLED=true (only after authorized testing/release)
ISNAD_MCP_ALLOWED_HOST=127.0.0.1:3478 (local test example)
ISNAD_MCP_LIMIT_MODE=local (loopback only) or redis (remote)
ISNAD_MCP_REDIS_URL=https://<dedicated-instance>.upstash.io (redis mode)
ISNAD_MCP_REDIS_TOKEN=<server-only secret>
ISNAD_MCP_LIMIT_NAMESPACE=<isolated-environment-name>
ISNAD_MCP_ALLOWED_ORIGIN=<optional exact origin>

Do not put secrets in the repo, portal, client configuration or logs.

## Connection page

/ connect (without the space) is a non-indexed, preview-only page listing all nine skills, proposed MCP address, limitations, and official platform instructions. It has no active installation, download or connection button. It is intentionally not linked from the public homepage. Actual ChatGPT and Claude installation remains unverified and dependent on client permissions.

## Pending acceptance

Fresh exact-head CI; real built endpoint tests across both eras and SEP-2640; adversarial origin/host tests at actual hosting ingress; real isolated Redis quota and failure tests; per-client and distributed concurrency limits; external-client testing; independent content and rights review; owner authorization before DNS, deployment or activation. No public installation claims.

References: https://upstash.com/docs/redis/features/restapi ; https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt ; https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
