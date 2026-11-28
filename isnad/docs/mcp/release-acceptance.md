# Isnad MCP v1 — Release acceptance register

Candidate is not authorized for public distribution until all evidence below is attached and owner approves the release. Do not infer scholarly approval from software tests.

## Engineering
- Baseline 07f8bf39157f7575faba7d225fd7f0e0814177d6, run 46128444767: SDK, isolated Redis, C1/C2/C2B passed, app 90 unit tests passed, build/lint passed, real legacy and modern SDK clients passed; forged Host test and dependency audit failed.
- Remediation candidate run 46128657689 generated and installed Next 16.4.6, eslint-config-next 16.4.6, sharp 0.35.5, source-map-js 1.2.2, brace-expansion 1.1.21 / 5.0.12; candidate audit reported 9 moderate, no high/critical. Commit fc6a93c30b2b6a51d01bf85aa34e3729ede94cd1 imports the generated dependency graph using the CI lock delta against unchanged baseline. Verify frozen installation and full/runtime audit on exact final head; review all remaining moderate advisories.
- Raw HTTP Host test now sends the header over node:http. Verify that actual rejection succeeds; if it fails, investigate actual ingress normalization, not relax security.
- New Redis distributed leases: 32 admitted handlers globally, 30-second expiry with atomic stale removal; release on finite response buffering or failure. Local process cap remains eight; response limit 512 KiB / read deadline 10 seconds; configured function duration 25 seconds. No long-lived SSE supported by this candidate. Verify legacy and modern clients, Redis lease integration, expiry/recovery, overload and large response cases. Admission limits do not guarantee exact network socket concurrency or provider bandwidth.
- Stable /mcp rewrite forwards to the existing gated /api/mcp handler. Both paths remain off by default. Verify exact host and all alias paths at the actual edge.
- Remote mode requires explicit ISNAD_MCP_INGRESS_VERIFIED=true in addition to existing service and Redis settings. Set only after evidence, not as a substitute for evidence.
- Vercel WAF recommendation: rate limit both /mcp and /api/mcp by source IP, start with 60 requests per 60 seconds per source, no interactive challenge on MCP routes. Validate thresholds with real SDK and shared NAT/client traffic, direct-origin bypass, forwarded-header spoofing, provider costs, trusted ingress, and privacy. The WAF rule is an operator task, not configured by this PR. See https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting.
- Dedicated managed Redis instance and protected test environment are not provisioned. Validate REST/TLS, failure recovery and actual independent worker contention before activation.
- Test the actual ChatGPT, Claude and MCP Inspector clients; SDK tests alone are insufficient. Record client/version, date, discovery, all nine tool calls and scope limitations.

## Content approval matrix
Pinned canonical source commit 4374e232b835ff41a625a326dbc478628689b87a. For each row require qualified reviewer identity, date, immutable source blob, provenance, citations, third-party excerpt rights, limitations, approved version and recorded decision. Status for all: pending independent review.

| Skill | Runtime bundle | Required focus |
|---|---|---|
| Islamic Teacher Core | core.md | Evidence hierarchy, uncertainty, referral boundaries |
| Tafsir | tafsir.md | Qur'an quotations, translations, recognized commentary and context |
| Hadith Sciences | hadith.md | Attribution, grading disagreement, authenticity vs matching |
| Fiqh | fiqh.md | School differences, legal authority, high-stakes referrals |
| Muamalat | muamalat.md | Fiqh dependency, contract mechanics, finance limits |
| Seerah | seerah.md | Chronology, source criticism, historical uncertainty |
| Aqidah | aqidah.md | Creed, scholarly differences, takfir boundaries |
| Arabic | arabic.md | Linguistic analysis, translation rights and interpretive boundaries |
| Dawah | dawah.md | Outreach, safeguarding, authority boundaries |

Repository MIT license is not proof of rights for third-party excerpts. Do not publish ZIPs before independent review. Review client-facing disclaimers and privacy policy for hosting logs, IP-based WAF and managed service processing.

## Release sign-off
- Exact final candidate CI green, no high/critical unresolved, moderate risk reviewed.
- Protected staging evidence, ingress WAF, real Redis, abuse/cost monitoring and rollback drill.
- All nine review approvals and rights clearance.
- Owner-approved production change window; separately expedite production framework patch if necessary.
- Confirm mcp.isnadsunnah.site DNS/TLS and /mcp routing; enable only after approval. Confirm /connect displays correct active status and approved downloads; current portal intentionally inactive.
- Rollback: disable ISNAD_MCP_ENABLED; revoke ingress approval; remove routing if needed; verify 404 from outside; rotate test credentials, preserve audit evidence. No database migration or Telegram webhook setup required for MCP.
