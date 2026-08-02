import Link from "next/link";

const evidenceSteps = [
  {
    number: "01",
    title: "Qur'an",
    description: "The primary revelation and first point of reference for every answer.",
  },
  {
    number: "02",
    title: "Authentic Sunnah",
    description: "Verified Prophetic guidance with source and authenticity made visible.",
  },
  {
    number: "03",
    title: "Companions",
    description: "How those closest to Prophet Muhammad ﷺ understood and practiced Islam.",
  },
  {
    number: "04",
    title: "Recognized Scholarship",
    description: "Classical explanation, legal method, and legitimate disagreement presented fairly.",
  },
];

const specialists = [
  {
    mark: "CORE",
    title: "Islamic Teacher Core",
    description: "Evidence hierarchy, verification standards, safety boundaries, and answer quality.",
    prompt: "What is the correct way to seek Islamic knowledge?",
  },
  {
    mark: "TFS",
    title: "Tafsīr Expert",
    description: "Qur'anic commentary, language, context, and comparison of classical explanations.",
    prompt: "Explain the opening verses of Sūrah al-Ḥujurāt.",
  },
  {
    mark: "HDTH",
    title: "Hadith Sciences",
    description: "Takhrīj, narrator analysis, grading differences, and fabricated-report checks.",
    prompt: "How can I verify whether a hadith is authentic?",
  },
  {
    mark: "FIQH",
    title: "Fiqh Expert",
    description: "Worship, purification, daily conduct, legal principles, and madhhab comparison.",
    prompt: "Did my rakʿah count if I joined after rukūʿ?",
  },
  {
    mark: "MUA",
    title: "Muʿāmalāt Expert",
    description: "Ribā, zakāh, business, contracts, investing, crypto, and modern financial life.",
    prompt: "How do I calculate zakāh on savings and crypto?",
  },
  {
    mark: "SRH",
    title: "Seerah Expert",
    description: "Prophetic biography, chronology, treaties, relationships, and source criticism.",
    prompt: "What is firmly established about the Hijrah?",
  },
  {
    mark: "AQD",
    title: "ʿAqīdah Expert",
    description: "Tawḥīd, īmān, qadar, the unseen, and carefully framed theological disagreement.",
    prompt: "How do divine decree and human choice fit together?",
  },
  {
    mark: "ARB",
    title: "Arabic Language",
    description: "Grammar, morphology, rhetoric, translation, diacritization, and semantic analysis.",
    prompt: "Parse إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ.",
  },
  {
    mark: "DWT",
    title: "Daʿwah & Tarbiyah",
    description: "Wise outreach, convert care, teaching, mentorship, and spiritual development.",
    prompt: "Create a first-month support plan for a new Muslim.",
  },
];

const principles = [
  {
    title: "Evidence before assertion",
    description: "Answers are organized around verifiable sources rather than confident-sounding claims.",
  },
  {
    title: "Disagreement stays visible",
    description: "Established rulings, majority positions, and legitimate differences are clearly separated.",
  },
  {
    title: "Specialists route automatically",
    description: "Each question is matched with the relevant knowledge module without weakening the Core.",
  },
  {
    title: "Responsible boundaries",
    description: "Sensitive matters are treated carefully and referred to qualified local authorities when needed.",
  },
];

const telegramMiniAppUrl = "https://t.me/the_isnad_bot/askiik";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none">
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" className="h-4 w-4" fill="none">
      <path d="m4.5 10.5 3.25 3.25L15.5 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TelegramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5" fill="none">
      <path d="m20.4 4.7-3 14.1c-.2 1-1 1.2-1.8.7l-4.6-3.4-2.2 2.1c-.2.2-.5.5-.9.5l.3-4.7 8.6-7.8c.4-.3-.1-.5-.6-.2L5.6 12.7 1 11.3c-1-.3-1-1 .2-1.5L19 3c.8-.3 1.6.2 1.4 1.7Z" fill="currentColor" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="landing-shell min-h-screen overflow-hidden text-white">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-orb landing-orb-one" aria-hidden="true" />
      <div className="landing-orb landing-orb-two" aria-hidden="true" />

      <header className="relative z-20 border-b border-white/[0.08] bg-[#050806]/75 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-10">
          <Link href="/" className="flex items-center gap-3" aria-label="Isnad home">
            <span className="isnad-mark" aria-hidden="true">
              <span />
            </span>
            <span className="font-display text-xl tracking-[-0.03em] text-white">Isnad</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-white/60 md:flex" aria-label="Primary navigation">
            <a href="#method" className="transition-colors hover:text-white">Method</a>
            <a href="#specialists" className="transition-colors hover:text-white">Specialists</a>
            <a href="#telegram" className="transition-colors hover:text-white">Telegram</a>
            <a href="#roadmap" className="transition-colors hover:text-white">Roadmap</a>
          </nav>

          <Link
            href="/ask"
            className="inline-flex items-center gap-2 rounded-full border border-[#d6b35b]/35 bg-[#d6b35b]/10 px-4 py-2 text-sm font-semibold text-[#f3d98f] transition hover:border-[#d6b35b]/60 hover:bg-[#d6b35b]/15"
          >
            Ask Isnad
            <ArrowIcon />
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto grid max-w-7xl items-center gap-14 px-5 pb-24 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.03fr_0.97fr] lg:px-10 lg:pb-32 lg:pt-28">
        <div>
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#2a8c69]/35 bg-[#0d281f]/70 px-3 py-1.5 text-xs font-medium uppercase tracking-[0.18em] text-[#7fd8b5]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#64d7a9] shadow-[0_0_14px_#64d7a9]" />
            Source-traced Islamic knowledge
          </div>

          <h1 className="max-w-4xl font-display text-5xl leading-[0.96] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl xl:text-[5.4rem]">
            Islamic knowledge,
            <span className="block bg-gradient-to-r from-[#f4dd9d] via-[#d9b85e] to-[#8dd8b8] bg-clip-text text-transparent">
              traced to its source.
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
            Ask questions about Islam and receive structured answers grounded in the Qur&apos;an,
            authentic Sunnah, the understanding of the Companions, and recognized Sunni scholarship.
            Sources, confidence, and legitimate disagreement remain visible.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/ask"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7b55d] px-6 py-3.5 text-sm font-bold text-[#0a100d] transition hover:-translate-y-0.5 hover:bg-[#ebcd7c]"
            >
              Start asking
              <ArrowIcon />
            </Link>
            <a
              href={telegramMiniAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Isnad Telegram Mini App"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.07]"
            >
              <TelegramIcon />
              Open Telegram Mini App
            </a>
          </div>

          <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-xs text-white/45">
            {["Verified source hierarchy", "Nine specialist modules", "Web and Telegram"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="text-[#72caa6]"><CheckIcon /></span>
                {item}
              </span>
            ))}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-xl lg:mx-0 lg:ml-auto">
          <div className="absolute -inset-8 rounded-[3rem] bg-[#1b6b4f]/15 blur-3xl" aria-hidden="true" />
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0f0c]/90 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="isnad-mark isnad-mark-small" aria-hidden="true"><span /></span>
                <div>
                  <p className="text-sm font-semibold">Isnad Assistant</p>
                  <p className="text-[11px] text-white/42">Evidence chain active</p>
                </div>
              </div>
              <span className="rounded-full border border-[#3c9d78]/25 bg-[#174b39]/30 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#82d6b4]">
                Live method
              </span>
            </div>

            <div className="space-y-5 p-5 sm:p-6">
              <div className="ml-auto max-w-[84%] rounded-2xl rounded-br-sm bg-[#164b39] px-4 py-3 text-sm leading-6 text-white/88">
                How do I calculate zakāh on savings and crypto?
              </div>

              <div className="rounded-2xl rounded-bl-sm border border-white/[0.08] bg-white/[0.035] p-4 sm:p-5">
                <div className="mb-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#d6b35b]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#e8ca7b]">Muʿāmalāt</span>
                  <span className="rounded-full bg-[#3a9b75]/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.13em] text-[#7dd3b0]">Strong majority</span>
                </div>
                <p className="text-sm font-semibold text-white">Financial summary</p>
                <p className="mt-2 text-sm leading-6 text-white/58">
                  Zakāh is generally due when your net zakātable wealth reaches niṣāb and remains in your possession for one lunar year. Crypto is assessed according to how it is held and used.
                </p>

                <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
                  {["Qur'an 9:60", "Verified Sunnah", "Fiqh analysis", "Assumptions shown"].map((source) => (
                    <div key={source} className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-xs text-white/58">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#d7b55d]" />
                      {source}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="border-t border-white/[0.08] p-4">
              <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-4 py-3 text-sm text-white/35">
                <span>Ask a question of Islamic knowledge…</span>
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#d7b55d] text-[#07100c]"><ArrowIcon /></span>
              </div>
            </div>
          </div>

          <div className="absolute -bottom-7 -left-4 hidden rounded-2xl border border-white/10 bg-[#0b130f]/90 p-4 shadow-2xl backdrop-blur-xl sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Answer chain</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-white/65">
              {["Qur'an", "Sunnah", "Salaf"].map((item, index) => (
                <div key={item} className="flex items-center gap-2">
                  {index > 0 && <span className="text-[#d7b55d]/50">→</span>}
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="method" className="relative z-10 border-y border-white/[0.08] bg-white/[0.02]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div>
              <p className="section-kicker">The Isnad method</p>
              <h2 className="mt-4 max-w-md font-display text-4xl tracking-[-0.04em] text-white sm:text-5xl">
                Not merely an answer. A visible chain of evidence.
              </h2>
              <p className="mt-6 max-w-lg text-sm leading-7 text-white/55 sm:text-base">
                Isnad applies a consistent research order to every question. It begins with revelation,
                distinguishes Prophetic reports from later opinions, and makes the strength of the conclusion clear.
              </p>
            </div>

            <div className="grid gap-3">
              {evidenceSteps.map((step, index) => (
                <div key={step.number} className="group grid gap-4 rounded-2xl border border-white/[0.08] bg-[#090e0b]/70 p-5 transition hover:border-[#d7b55d]/25 hover:bg-[#0c1510] sm:grid-cols-[64px_1fr_auto] sm:items-center sm:p-6">
                  <span className="font-mono text-xs tracking-[0.16em] text-[#d7b55d]/70">{step.number}</span>
                  <div>
                    <h3 className="text-base font-semibold text-white">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-white/48">{step.description}</p>
                  </div>
                  <div className="hidden items-center gap-2 sm:flex" aria-hidden="true">
                    <span className="h-2 w-2 rounded-full bg-[#d7b55d] shadow-[0_0_14px_rgba(215,181,93,0.6)]" />
                    {index < evidenceSteps.length - 1 && <span className="h-px w-6 bg-white/10" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="specialists" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
          <div>
            <p className="section-kicker">Specialist intelligence</p>
            <h2 className="mt-4 max-w-2xl font-display text-4xl tracking-[-0.04em] text-white sm:text-5xl">
              One assistant. Multiple disciplines. One governing method.
            </h2>
          </div>
          <p className="max-w-md text-sm leading-7 text-white/50">
            Isnad routes each question to the relevant specialist while the Islamic Teacher Core remains authoritative across every response.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {specialists.map((specialist) => (
            <article key={specialist.title} className="specialist-card group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <span className="rounded-lg border border-[#d7b55d]/20 bg-[#d7b55d]/[0.07] px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-[0.14em] text-[#e0c575]">
                  {specialist.mark}
                </span>
                <span className="text-white/20 transition group-hover:translate-x-1 group-hover:text-[#d7b55d]"><ArrowIcon /></span>
              </div>
              <h3 className="mt-8 text-lg font-semibold tracking-[-0.02em] text-white">{specialist.title}</h3>
              <p className="mt-3 text-sm leading-6 text-white/48">{specialist.description}</p>
              <Link href={`/ask?q=${encodeURIComponent(specialist.prompt)}`} className="mt-7 block border-t border-white/[0.07] pt-4 text-xs leading-5 text-white/35 transition hover:text-white/65">
                “{specialist.prompt}”
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.08] bg-[#07100c]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
          <div className="grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
            <div className="relative rounded-[2rem] border border-white/[0.09] bg-[#050806] p-4 shadow-2xl sm:p-6">
              <div className="rounded-[1.4rem] border border-white/[0.08] bg-[#0b120e] p-5 sm:p-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-[#d7b55d]">Answer audit</p>
                    <h3 className="mt-2 text-xl font-semibold">What Isnad checks before replying</h3>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#184a39] text-[#87d5b6]"><CheckIcon /></span>
                </div>
                <div className="mt-8 space-y-3">
                  {[
                    "Qur'anic references match the intended verse",
                    "Hadith sources and gradings are not invented",
                    "Companion statements are not labeled Prophetic",
                    "Legitimate scholarly disagreement is represented",
                    "Personal high-stakes rulings are handled responsibly",
                  ].map((item) => (
                    <div key={item} className="flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-4 py-3.5 text-sm text-white/58">
                      <span className="mt-0.5 text-[#6bc39f]"><CheckIcon /></span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <p className="section-kicker">Built for trust</p>
              <h2 className="mt-4 max-w-xl font-display text-4xl tracking-[-0.04em] text-white sm:text-5xl">
                Clear about what is known, disputed, or still uncertain.
              </h2>
              <p className="mt-6 max-w-xl text-sm leading-7 text-white/52 sm:text-base">
                Reliable Islamic teaching requires more than retrieving a quote. Isnad separates evidence from interpretation and explains the practical conclusion without pretending every matter is unanimous.
              </p>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {principles.map((principle) => (
                  <div key={principle.title}>
                    <h3 className="text-sm font-semibold text-white">{principle.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-white/45">{principle.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="telegram" className="relative z-10 mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="telegram-panel relative overflow-hidden rounded-[2rem] border border-[#d7b55d]/15 px-6 py-12 sm:px-10 lg:px-16 lg:py-16">
          <div className="absolute right-0 top-0 h-64 w-64 translate-x-1/3 -translate-y-1/3 rounded-full bg-[#247355]/25 blur-3xl" aria-hidden="true" />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_0.75fr] lg:items-center">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/55">
                <TelegramIcon />
                Built for Telegram
              </div>
              <h2 className="max-w-2xl font-display text-4xl tracking-[-0.04em] text-white sm:text-5xl">
                Islamic guidance where your conversations already happen.
              </h2>
              <p className="mt-6 max-w-2xl text-sm leading-7 text-white/52 sm:text-base">
                Use the same evidence-aware assistant through the Isnad Telegram bot or launch the mobile-first Mini App without leaving Telegram.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="https://t.me/the_isnad_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7b55d] px-6 py-3.5 text-sm font-bold text-[#09100d] transition hover:bg-[#ebcd7c]"
                >
                  <TelegramIcon />
                  Launch the bot
                </a>
                <a
                  href={telegramMiniAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the Isnad Telegram Mini App"
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]"
                >
                  Open Mini App
                  <ArrowIcon />
                </a>
              </div>
            </div>

            <div className="mx-auto w-full max-w-sm rounded-[2.2rem] border border-white/10 bg-black/35 p-3 shadow-2xl">
              <div className="rounded-[1.65rem] border border-white/[0.08] bg-[#0a110d] p-5">
                <div className="flex items-center gap-3 border-b border-white/[0.07] pb-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#184a39] text-[#8fdcbd]"><TelegramIcon /></span>
                  <div>
                    <p className="text-sm font-semibold">Isnad Sunnah</p>
                    <p className="text-[11px] text-white/38">AI Islamic Research Assistant</p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <div className="rounded-2xl rounded-bl-sm bg-white/[0.06] px-4 py-3 text-xs leading-5 text-white/58">
                    Ask about Qur&apos;an, hadith, fiqh, seerah, Arabic, or Islamic finance.
                  </div>
                  <div className="ml-auto max-w-[80%] rounded-2xl rounded-br-sm bg-[#1b5a43] px-4 py-3 text-xs leading-5 text-white/82">
                    Explain the hadith about intentions.
                  </div>
                  <div className="rounded-2xl rounded-bl-sm border border-[#d7b55d]/10 bg-[#d7b55d]/[0.05] px-4 py-3 text-xs leading-5 text-white/58">
                    Routing to Hadith Sciences and Arabic Language…
                  </div>
                </div>
                <a
                  href={telegramMiniAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 block rounded-xl bg-[#d7b55d] py-3 text-center text-xs font-bold text-[#09100d] transition hover:bg-[#ebcd7c]"
                >
                  OPEN ISNAD
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="roadmap" className="relative z-10 border-t border-white/[0.08] bg-white/[0.018]">
        <div className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10 lg:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
            <div>
              <p className="section-kicker">Product roadmap</p>
              <h2 className="mt-4 font-display text-4xl tracking-[-0.04em] text-white sm:text-5xl">From answers to structured learning.</h2>
              <p className="mt-6 text-sm leading-7 text-white/48">
                The platform is expanding beyond single questions into a connected Islamic learning environment across web and Telegram.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {["Saved conversations", "Bookmarks and personal notes", "Guided learning paths", "Arabic study tools", "Daily knowledge reminders", "Community study programs"].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-[#090e0b] px-5 py-5">
                  <span className="text-sm text-white/65">{item}</span>
                  <span className="font-mono text-[10px] tracking-[0.14em] text-white/25">0{index + 1}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 px-5 py-24 sm:px-8 lg:px-10 lg:py-32">
        <div className="mx-auto max-w-5xl text-center">
          <p className="font-arabic text-2xl text-[#d7b55d]">اسأل بالدليل</p>
          <h2 className="mx-auto mt-5 max-w-4xl font-display text-4xl tracking-[-0.045em] text-white sm:text-6xl">
            Ask the question. Trace the answer. Know the degree of certainty.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-sm leading-7 text-white/48 sm:text-base">
            Begin with the web assistant or continue inside Telegram. The method remains the same.
          </p>
          <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/ask" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#d7b55d] px-7 py-3.5 text-sm font-bold text-[#09100d] transition hover:bg-[#ebcd7c]">
              Ask Isnad now
              <ArrowIcon />
            </Link>
            <a href={telegramMiniAppUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-7 py-3.5 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.08]">
              <TelegramIcon />
              Continue on Telegram
            </a>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-white/[0.08]">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_auto] lg:px-10">
          <div>
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="isnad-mark isnad-mark-small" aria-hidden="true"><span /></span>
              <span className="font-display text-lg text-white">Isnad</span>
            </Link>
            <p className="mt-4 max-w-md text-xs leading-6 text-white/35">
              Educational Islamic guidance grounded in traceable evidence. Isnad does not replace a qualified scholar for personal, legal, or high-stakes rulings.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm text-white/45 sm:grid-cols-4">
            <Link href="/ask" className="hover:text-white">Ask</Link>
            <a href="#method" className="hover:text-white">Method</a>
            <a href={telegramMiniAppUrl} target="_blank" rel="noopener noreferrer" className="hover:text-white">Mini App</a>
            <a href="https://github.com/gwapupward-hub/offiiK" target="_blank" rel="noopener noreferrer" className="hover:text-white">GitHub</a>
          </div>
        </div>
        <div className="border-t border-white/[0.06] px-5 py-5 text-center text-[11px] text-white/25">
          © 2026 Isnad. Allah knows best.
        </div>
      </footer>
    </main>
  );
}
