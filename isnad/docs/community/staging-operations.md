# Isnad Community OS — isolated staging runbook

This is a code-preparation sprint. No production release, database migration, or bot configuration change was performed.

## Provision the isolated environment

1. In BotFather, create a new bot using /newbot, not @the_isnad_bot. Save the token privately in the staging environment.
2. In the Vercel Marketplace/Storage UI, provision a new Neon Postgres resource specifically for Isnad staging. The connected Neon organization is Vercel-managed and rejected direct project creation through its API. Do not reuse GWAP projects or clone production data. The staging database must be named isnad_staging and the connecting role isnad_staging_owner. Confirm this is a separate resource from production.
3. Use a dedicated staging deployment and stable HTTPS origin, with Telegram's webhook reachable without interactive authentication. Keep any staging access restrictions appropriate to the admin UI; do not relax the existing production project protections. Do not connect production secrets to the staging deployment.
4. Set distinct staging credentials and a separate limited-quota OpenAI key. Store secrets only in a private environment, not in Git, issues, or chat.

| Setting | Value |
|---|---|
| ISNAD_RELEASE_TARGET | staging (operator process) |
| ISNAD_STAGING_BOT_USERNAME | actual new bot username |
| TELEGRAM_BOT_USERNAME | same staging bot username |
| TELEGRAM_BOT_TOKEN | new staging bot token (secret) |
| ISNAD_STAGING_ORIGIN | exact independently verified staging HTTPS origin |
| PUBLIC_BASE_URL | same staging origin |
| TELEGRAM_MINI_APP_URL | staging origin followed by /telegram |
| DATABASE_URL | isolated staging connection string (secret), database isnad_staging, role isnad_staging_owner |
| ISNAD_STAGING_DATABASE_HOST | exact staging database hostname (independently verify it) |
| TELEGRAM_WEBHOOK_SECRET | independently generated random secret, at least 32 characters |
| CRON_SECRET | distinct random secret, at least 32 characters |
| OPENAI_API_KEY | separate staging-only secret |
| ISNAD_COMMUNITY_ENABLED | true for the isolated staging deployment only |

The staging command is designed to be run from a trusted local/operator environment, not from a Vercel production build process. A separate Vercel project may label its own deployment environment production; that does not authorize running these operator commands in that environment. Ensure the deploy itself uses the intended staging secrets. Keep verification's runtime release flag off; testing live /verify requires a separate staging-only runtime design and review.

## Explicit operations

The vercel-build script now runs only next build. Neither database migrations nor Telegram setup may execute using --vercel-build. Keep this branch unmerged until reviewed.

- Install dependencies with npm ci in isnad/.
- Run npm run test:staging and the regular CI suite; these do not need real bot credentials.
- Run npm run staging:preflight with the isolated staging operator environment. It performs identity checks and reads; an incomplete schema, unavailable deployment, or unregistered webhook means the environment is not yet ready. The expected database host/name/role checks supplement, but do not replace, independent resource verification.
- After independently confirming isolation and obtaining authorization for staging writes, run npm run db:migrate. Staging mode validates both the configured URL and connected database identity before executing SQL.
- Deploy the reviewed staging commit, with the staging environment and no live production credentials.
- Verify the staging health endpoint is healthy and unauthenticated webhook requests return 401. Then run npm run telegram:setup from the same staging operator environment. This checks the bot identity via getMe before changing any commands or webhook; it rejects the production bot and a conflicting existing webhook.
- Run npm run staging:preflight again. It checks bot identity, actual webhook target, database identity, applied migrations, health, community enablement and rejection of missing webhook credentials. It does not certify live delivery, scholarly accuracy, or that deployed credentials match operator credentials.
- Configure the staging-only authenticated inbox drain scheduler and perform the live test matrix in issue #46. Verify the cron endpoint and backup/restore separately.

## Release controls

- No production webhook or database writes are authorized.
- Keep isnad/vercel.json's main auto-deployment gate in place.
- Staging preparation does not authorize flipping verification on, ingesting religious source corpora, merging PR #45, or promoting a deployment.
- Review actual test-bot identity and Vercel/Neon resource IDs before attaching credentials; keep them distinct from production.
- Record non-secret evidence, not connection strings, bot tokens, OpenAI keys, raw message content or initData.
- A future production release requires separate migration, deploy and bot setup approvals and documented rollback evidence.
