# Sprint 01-E.1 — end-to-end acceptance and security gate

Verified baseline: PR #48 head dcc557c16e8741eea9fcc0a6f4f2c8b4e494527d, merge-test b8d1dfc, MCP run 46128015061. All four workflows passed (MCP, C1, C2, C2B). SDK tests 3/3 in process and 3/3 over actual locally built Next.js, application unit tests 90/90, build, lint, nine ZIP checks, and disabled connection portal smoke test passed. HTTP 403 corrective patch verified by successful modern/legacy HTTP clients. SDK audit reported zero vulnerabilities. Application npm ci reported 13 vulnerabilities (9 moderate, 3 high, 1 critical); this is an unresolved release blocker, not evidence of exploitability or attribution to a specific package. Audit both runtime and complete graphs and classify from exact advisory records before attempting remediation.

## New acceptance gates

- Dedicated application audit job records JSON for runtime and full graphs, identifies high/critical findings in logs, and fails for high/critical or unavailable audit. Do not suppress findings or use npm audit fix --force. Apply minimal reviewed upgrades only, regenerate the lockfile, and repeat all gates.
- Disposable Redis CI service runs the actual production Lua script through redis-cli using a test-only REST adapter, verifies atomic cross-instance budget, boundary behavior, TTL, expiration and provider failure. This validates Redis semantics, not the managed provider network/TLS or production credentials.
- Built HTTP tests cover foreign origin, forged host, invalid content type, oversize body, no-store response, and inactive/noindex connection portal without credential variable names.
- The dedicated CI path filter includes MCP documentation changes so a documentation-only candidate still obtains exact-head verification.

## Operator acceptance sequence (separate authorization required for external systems)

1. Resolve dependency audit findings. Freeze and review exact candidate and all CI evidence.
2. Select isolated Redis provider account/instance and namespace; configure only server-side secrets on a protected test environment. No production credentials, database or deployment settings reused. Verify provider REST authentication, TLS, outage behavior, concurrent admissions from independent workers and quota expiry. Verify cost cap and alerting.
3. Design per-client rate limit using a trusted ingress identity or scoped API credentials; do not accept unverified X-Forwarded-For as client identity. Validate distributed concurrency, stream/body lifetime, bandwidth and rate/burst protections at actual ingress; the current global quota and process-local cap are not sufficient for production fairness.
4. Test actual compatible external clients (MCP Inspector, ChatGPT, Claude) against an explicitly authorized protected endpoint. Confirm tool discovery and retrieval of all nine modules, Core-first hierarchy, no private corpus access, no personal question required, and no false verification claims.
5. Perform independent content/provenance and redistribution-rights review. Document evidence and approvals for every skill. Never publish unapproved archive or enable service.
6. Obtain explicit owner authorization before merge, DNS configuration, deployment, public activation or plugin submission. Confirm rollback via disable flag, disable public routing and revert if needed.

New tests and audit gate require exact-head CI; no managed Redis provisioning, external client testing or release approval was performed.
