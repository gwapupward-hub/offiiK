# Isnad

**Source-traced Islamic knowledge for the web and Telegram.**

Isnad is a modular Islamic knowledge assistant built with Next.js and OpenAI. It answers questions through an evidence hierarchy—Qur’an, authentic Sunnah, the understanding of the Companions, and recognized Sunni scholarship—while making scholarly disagreement and uncertainty visible.

[Open the live app](https://isnadsunnah.vercel.app/) · [Launch the Telegram experience](https://isnadsunnah.vercel.app/telegram)

> Isnad provides educational guidance, not binding fatwas. High-stakes matters such as divorce, inheritance, apostasy rulings, medical decisions, and immediate safety concerns should be taken to an appropriately qualified local authority.

## What it does

- Provides one chat experience across the website, Telegram Mini App, and Telegram bot.
- Keeps the Islamic Teacher Core authoritative on every request.
- Routes questions to focused specialists instead of loading every domain indiscriminately.
- Supports multiple specialists for cross-domain questions.
- Presents source tiers, practical guidance, and degree-of-certainty indicators.
- Keeps OpenAI and Telegram credentials on the server.
- Preserves the original skill specifications and references for provenance.

## Knowledge architecture

Every request loads the **Islamic Teacher Core** first. The router then adds only the specialist knowledge relevant to the question.

| Module | Scope |
| --- | --- |
| Islamic Teacher Core | Shared evidence hierarchy, verification rules, answer format, and safety policy |
| Tafsīr Expert | Qur’anic commentary, vocabulary, occasions of revelation, qirāʾāt, and classical tafsīr comparison |
| Hadith Sciences Expert | Takhrīj, isnād and matn analysis, narrator criticism, grading disputes, and fabricated-report checks |
| Fiqh Expert | Worship, purification, family law, daily conduct, madhhab comparison, legal maxims, and contemporary rulings |
| Muʿāmalāt Expert | Islamic finance, ribā, zakāh, contracts, investing, business, inheritance, and modern transactions |
| Seerah Expert | Prophetic biography, chronology, campaigns, treaties, relationships, and historical source criticism |
| ʿAqīdah Expert | Tawḥīd, īmān and kufr, Allah’s names and attributes, qadar, the unseen, and theological disagreement |
| Arabic Language Expert | Translation, grammar, morphology, semantics, rhetoric, diacritization, MSA, and dialects |
| Daʿwah & Tarbiyah Expert | Outreach, convert care, teaching, mentorship, spiritual formation, correction, and community programs |

Finance questions follow the hierarchy:

```text
Islamic Teacher Core → Fiqh Expert → Muʿāmalāt Expert
```

Other cross-domain questions can load several specialists, but each remains within its field and none may weaken the Core’s evidence or safety standards.

## How it works

1. A question reaches `POST /api/chat` from the website or Telegram Mini App.
2. `lib/knowledge.ts` classifies the question and assembles the system prompt from the Core plus relevant specialists.
3. `lib/providers.ts` sends the prompt and conversation to OpenAI.
4. The API returns the answer together with routing metadata.
5. The UI parses supported answer headings into a visible source chain and certainty indicator.

Telegram Mini App requests include signed `initData`. The server validates it with the bot token before answering. Direct bot conversations arrive through a protected Telegram webhook and use the same knowledge pipeline.

## Tech stack

- Next.js 16 App Router
- React 19 and TypeScript
- OpenAI API
- Tailwind CSS 4
- Telegram Web App SDK and Bot API
- Vercel

## Repository layout

```text
offiiK/
├── README.md
└── isnad/
    ├── app/                     # Web UI, Telegram UI, and API routes
    ├── components/              # Answer, source-chain, certainty, and loading UI
    ├── docs/knowledge-sources/  # Canonical skill specs, references, and manifests
    ├── knowledge/               # Runtime knowledge bundles
    ├── lib/                     # Routing, OpenAI, parsing, and Telegram logic
    ├── scripts/                 # Telegram bot setup
    ├── design/                  # Standalone UX reference
    └── package.json
```

## Local development

Requirements:

- Node.js 20 or newer
- npm
- An OpenAI API key

```bash
git clone https://github.com/gwapupward-hub/offiiK.git
cd offiiK/isnad
npm install
cp .env.local.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Yes | Powers answers on every surface |
| `OPENAI_MODEL` | No | Overrides the default OpenAI model without a code change |
| `TELEGRAM_BOT_TOKEN` | For Telegram | Validates Mini App sessions and powers the bot |
| `TELEGRAM_WEBHOOK_SECRET` | For the bot webhook | Verifies that webhook requests came through Telegram |

Never commit `.env.local` or expose these values to browser code.

## Commands

Run commands from `isnad/`.

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local development server |
| `npm run build` | Create a production build |
| `npm start` | Run the production server |
| `npm run lint` | Run ESLint |
| `npm run telegram:setup -- <base-url>` | Register bot commands, webhook, and Mini App menu button |

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather) and save the token.
2. Register `https://<your-domain>/telegram` as the Mini App URL.
3. Add `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` to the deployment environment.
4. Register the bot configuration:

```bash
TELEGRAM_BOT_TOKEN=<bot-token> \
TELEGRAM_WEBHOOK_SECRET=<strong-random-secret> \
npm run telegram:setup -- https://<your-domain>
```

The setup script is idempotent, so it can be rerun after changing the domain, commands, or webhook secret.

## Editing or adding knowledge

Runtime content lives in `isnad/knowledge/`. Content-only changes can be made directly to those Markdown files.

To add a specialist:

1. Add its runtime knowledge bundle under `isnad/knowledge/`.
2. Preserve its canonical specification and references under `isnad/docs/knowledge-sources/`.
3. Add a focused routing predicate in `isnad/lib/knowledge.ts`.
4. Add the module to the prompt assembly without overriding the Core.
5. Expose routing metadata to the web and Telegram interfaces.
6. Test positive routes, cross-domain routes, and false-positive protection.

## Deployment

The app is configured for Vercel. Because the application is inside `isnad/`, set that directory as the project’s **Root Directory**.

Before deploying:

```bash
cd isnad
npm run lint
npm run build
```

Add the required environment variables in Vercel, then redeploy after changing any runtime secret.

## Responsible-use boundaries

Isnad is designed to:

- distinguish established evidence from scholarly inference;
- disclose legitimate disagreement instead of flattening it;
- avoid invented citations and false certainty;
- refer sensitive, personal, or legally consequential cases to qualified people;
- separate hadith authentication, Qur’anic interpretation, legal derivation, creed, history, language, and community guidance by specialist scope.

It is not a replacement for qualified scholars, emergency services, physicians, attorneys, or other responsible local authorities.

## License

MIT. See [`isnad/LICENSE`](isnad/LICENSE).
