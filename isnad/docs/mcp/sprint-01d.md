# Sprint 01-D — SDK compatibility candidate

Status: implementation staged, execution pending. No public access or live application integration.

The official TypeScript SDK v2 supports modern 2026-07-28 and legacy 2025 clients. The isolated candidate under tools/isnad-mcp-compat pins server/client 2.4.0 and Zod 4.6.7. It reuses the existing pinned registry and does not alter the application lockfile, Telegram, production, database or existing HTTP prototype. Native SDK createMcpHandler uses stateless legacy fallback. The SDK's Skills extension is attached from nine generated Agent Skills with valid folder names, frontmatter and required bundled references. This is an implementation candidate, not verified compatibility; the extension API is experimental.

References:
- https://ts.sdk.modelcontextprotocol.io/v2/protocol-versions
- https://ts.sdk.modelcontextprotocol.io/v2/servers/skills
- https://ts.sdk.modelcontextprotocol.io/v2/testing

CI must generate and audit the initial lockfile, run modern/legacy SDK client tests, generate nine local ZIPs and test the existing application. Archives are intentionally not uploaded or published pending content/rights review. Only the candidate dependency lockfile is uploaded for review and subsequent checked-in frozen install. Test results must be inspected before acceptance.

Remaining: test negotiated Skills discovery/get/read explicitly, validate reference integrity on the wire, commit the audited lockfile, integrate SDK route and remove the handwritten prototype, verify real Next.js production artifact, add ingress host/origin validation, bounded bodies/timeouts, rate/concurrency controls, privacy review and security tests. Test real ChatGPT, Claude, MCP Inspector and other supported clients only on an explicitly authorized protected test endpoint. Optional ChatGPT research search/fetch tools must not be mistaken for a verified source corpus and would accept query data, so they are deferred pending a separate privacy decision. No public connection portal or plugin submission yet.
