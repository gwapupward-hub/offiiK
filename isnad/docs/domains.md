# Isnad production domains

The Vercel project is `isnadsunnah` in `bigdaddygwaps-projects`, connected to `gwapupward-hub/offiiK` with root directory `isnad`.

## Domain mapping

| Hostname | Role |
| --- | --- |
| `www.isnadsunnah.site` | Primary production hostname |
| `isnadsunnah.site` | Vercel permanent redirect to `www.isnadsunnah.site`, retaining the path and query |
| `isnadsunnah.vercel.app` | Existing production alias |
| `isnadsunnah-bigdaddygwaps-projects.vercel.app` | Existing project alias |
| `isnadsunnah-git-main-bigdaddygwaps-projects.vercel.app` | Existing main-branch alias |

`site.config.mjs` sets the canonical origin for page metadata, Open Graph URLs, the sitemap, robots.txt, and the Telegram setup fallback. Each page advertises its own path on the primary hostname. Relative app navigation, API calls, and installable-app assets continue to work on the domains assigned to the Vercel project. Preview deployments are not redirected to production.

Keep existing aliases serving the application while migrating Telegram: a webhook or an installed Mini App may still use one of them. Adding a custom hostname in Vercel does not automatically update Telegram settings.

## Vercel environment

Set these public values in the project's Production environment before redeploying:

```dotenv
PUBLIC_BASE_URL=https://www.isnadsunnah.site
TELEGRAM_MINI_APP_URL=https://www.isnadsunnah.site/telegram
```

Update the same URL variables in other environments if they currently point at an old production hostname. Preserve deliberate preview or development URLs. Keep the existing bot token, webhook secret, database credentials, and OpenAI key unchanged.

The setup script accepts an explicit base URL first, then `PUBLIC_BASE_URL`, then the canonical origin. It no longer falls back to Vercel's generated production hostname. An existing environment value still takes precedence and must be updated during migration.

## Telegram migration

Use the primary hostname directly for the webhook; the apex redirects to `www`.

| Setting | URL |
| --- | --- |
| Webhook | `https://www.isnadsunnah.site/api/telegram/webhook` |
| Bot menu Mini App | `https://www.isnadsunnah.site/telegram` |
| BotFather Mini App (`@the_isnad_bot/askiik`) | `https://www.isnadsunnah.site/telegram` |

`npm run vercel-build` runs Telegram setup only for Production. With the two URL environment variables updated, it re-registers the webhook and the bot menu without dropping pending updates. To run setup manually with the existing secrets available:

```bash
TELEGRAM_MINI_APP_URL=https://www.isnadsunnah.site/telegram \
npm run telegram:setup -- https://www.isnadsunnah.site
```

The named Mini App's BotFather URL is separate from the Bot API menu button. Update it in BotFather as well; the `https://t.me/the_isnad_bot/askiik` launch link remains the same.

## Verification

- The apex redirects to the primary hostname with paths and queries preserved.
- `/`, `/ask`, and `/telegram` render on the primary hostname and existing aliases.
- Canonical and Open Graph URLs use `https://www.isnadsunnah.site` with the page's path.
- `/sitemap.xml` lists public pages on the custom domain; `/robots.txt` points to that sitemap.
- `/api/health` reports readiness; this checks configuration presence, not Telegram's registered URLs.
- Production build logs verify the new webhook URL and report the new menu URL. Verify the named Mini App in Telegram after the BotFather change.

No domain-registration purchase, DNS-provider change, or removal of existing aliases is required by the code changes.
