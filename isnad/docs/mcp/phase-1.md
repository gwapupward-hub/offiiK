# Isnad MCP v1 — Phase 1 foundation

Status: isolated development prototype; not approved for public use. Registry version 0.1.0. Baseline: 4374e232b835ff41a625a326dbc478628689b87a.

## Scope and boundaries

The server distributes existing educational methodology, not AI-generated answers or verified Quran/hadith records. It uses a fixed allowlist of nine public repository Markdown bundles. Every specialist receives the Core; finance receives Core, Fiqh, then Mu'amalat. Each bundle is pinned to its original Git blob; a changed bundle fails closed until the registry is deliberately updated. Responses contain SHA-256 content digests, pinned source links, repository license and educational limitations. A digest verifies byte identity, not scholarly correctness. No database, Telegram, OpenAI, user identity, private files, arbitrary paths or external fetches are used. The endpoint accepts no questions or personal context.

## Local testing only

From isnad/, install the existing lockfile with npm ci, run npm run typecheck, npm test and npm run build. Start the local server with ISNAD_MCP_ENABLED=true npm run dev. The flag must not be enabled on production or publicly accessible previews until approved. Native clients omit Origin; browser origins are rejected unless the operator configures one exact ISNAD_MCP_ALLOWED_ORIGIN. This does not grant CORS access. The hosting layer must additionally validate the Host and enforce rate and concurrency limits before public exposure.

Endpoint: http://localhost:3000/api/mcp (local only).

Example handshake:

    curl -i http://localhost:3000/api/mcp \
      -H 'Content-Type: application/json' \
      -H 'Accept: application/json, text/event-stream' \
      --data '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"local-test","version":"1"}}}'

Send notifications/initialized without an id, then tools/list or tools/call with params {"name":"fiqh_expert","arguments":{}} and negotiated MCP-Protocol-Version. Resources are discoverable using resources/list and resources/read; exact URI matching only. GET and DELETE return 405 when enabled. JSON-only responses, stateless transport, no SSE, prompts, auth or session allocation. This is a limited hand-written compatibility prototype, not a claim of full MCP compliance. The 2026-07-28 modern protocol and formal Skills extension are not implemented. Adopt/test a maintained official SDK or adapter and lockfile before public release.

## Proposed distribution

Public connection portal: https://www.isnadsunnah.site/connect (planned).
Public MCP URL: https://mcp.isnadsunnah.site/mcp (planned; DNS, routing and certificates not configured by this change).
Portable Agent Skills ZIPs, formal Skills extension discovery, ChatGPT app/plugin submission, and client instructions follow after review. The external AI controls how it uses the provided methodology and must independently verify primary evidence.

## Release gates (all pending)

- Full canonical specification, reference provenance, redistribution rights and qualified scholarly review of all nine bundles; repository MIT license does not establish rights in third-party excerpts.
- Test against maintained MCP SDK clients/Inspector, current protocol versions, actual client connection constraints, and formal Skills extension interoperability.
- npm ci, typecheck, lint, unit and integration tests, Next production build, and deployed artifact tracing check.
- Negative tests for malformed payloads, arbitrary resource paths, changed bundle digests, oversized responses, origin/host handling, request floods, timeouts, and privacy.
- Hosting-level abuse limits, monitoring without personal-content logging, explicit release flag and kill switch, cost limits and rollback.
- Keep private community records and pending source reviews excluded; never mark methodology as independently verified evidence.
- Obtain owner approval before enabling any public endpoint, configuring DNS, merging, deploying or submitting an app.

No migration or production activation is needed for this foundation.
