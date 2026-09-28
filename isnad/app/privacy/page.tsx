import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Isnad collects, uses, stores, and protects information across the website, Telegram bot, and Telegram Mini App.",
  alternates: {
    canonical: "/privacy",
  },
};

const sections = [
  {
    title: "1. What this policy covers",
    body: (
      <>
        <p>
          This Privacy Policy explains how Isnad handles information when you use
          the Isnad website, AI assistant, Telegram bot, Telegram Mini App, saved
          conversations, learning tools, library features, and related services.
        </p>
        <p>
          Isnad is designed to collect only the information reasonably needed to
          operate, secure, personalize, and improve the service.
        </p>
      </>
    ),
  },
  {
    title: "2. Information we collect",
    body: (
      <>
        <p>Depending on how you use Isnad, we may process the following:</p>
        <ul>
          <li>
            <strong>Telegram account information:</strong> Telegram user ID,
            first and last name, username, language code, and other account
            details Telegram makes available to the Mini App or bot.
          </li>
          <li>
            <strong>Profile and preference information:</strong> display name,
            bio, language, answer-length preference, Arabic display preference,
            transliteration preference, citation depth, madhhab context, theme,
            and memory setting.
          </li>
          <li>
            <strong>Conversation content:</strong> questions, messages, AI
            responses, conversation titles, routing metadata, citations, and
            related history when persistent history is enabled.
          </li>
          <li>
            <strong>Saved learning and library data:</strong> bookmarks, notes,
            saved conversations, course or lesson progress, and similar data
            when you use those features.
          </li>
          <li>
            <strong>Usage and service events:</strong> internal event names,
            feature activity, timestamps, model information, citation counts,
            latency, and similar operational analytics.
          </li>
          <li>
            <strong>Security and technical data:</strong> request metadata needed
            to authenticate Telegram sessions, prevent abuse, deduplicate
            Telegram updates, enforce rate limits, and diagnose service errors.
            For anonymous web requests, an IP address may be processed in
            transit and a one-way hash derived from a request identifier may be
            used for rate limiting.
          </li>
        </ul>
      </>
    ),
  },
  {
    title: "3. Anonymous web use",
    body: (
      <>
        <p>
          If you use the public web chat without an authenticated Telegram
          session, Isnad does not create a persistent Isnad account for that
          request and does not add the conversation to your Isnad conversation
          history.
        </p>
        <p>
          Your prompt still must be processed by the AI provider to generate a
          response, and limited technical data may be processed for security,
          abuse prevention, rate limiting, and service reliability.
        </p>
      </>
    ),
  },
  {
    title: "4. How we use information",
    body: (
      <ul>
        <li>Provide and personalize Islamic knowledge features.</li>
        <li>Authenticate Telegram Mini App and bot sessions.</li>
        <li>Save conversations, settings, notes, bookmarks, and learning progress.</li>
        <li>Generate AI responses and source-aware citations.</li>
        <li>Maintain conversation memory when you enable it.</li>
        <li>Prevent abuse, enforce rate limits, and protect the service.</li>
        <li>Measure reliability and improve product quality.</li>
        <li>Comply with legal obligations and enforce applicable terms.</li>
      </ul>
    ),
  },
  {
    title: "5. AI processing",
    body: (
      <>
        <p>
          Isnad uses OpenAI to generate AI-assisted responses. To answer a
          question, Isnad may send the question, recent conversation context,
          relevant system instructions, and necessary response preferences to
          OpenAI.
        </p>
        <p>
          Do not submit passwords, API keys, wallet seed phrases, private keys,
          government identification numbers, or other secrets that are not
          necessary for your question.
        </p>
      </>
    ),
  },
  {
    title: "6. Service providers and disclosures",
    body: (
      <>
        <p>
          Isnad relies on service providers to operate the product. These may
          include:
        </p>
        <ul>
          <li>
            <strong>Telegram</strong> for bot and Mini App identity, delivery,
            and platform features.
          </li>
          <li>
            <strong>OpenAI</strong> for AI response generation.
          </li>
          <li>
            <strong>Vercel</strong> for website hosting, deployment, and
            application infrastructure.
          </li>
          <li>
            <strong>Database and infrastructure providers</strong> used to store
            persistent account and application data.
          </li>
        </ul>
        <p>
          We may also disclose information when reasonably necessary to comply
          with law, respond to valid legal process, protect users, investigate
          abuse, or defend the rights and security of Isnad.
        </p>
      </>
    ),
  },
  {
    title: "7. Selling data and advertising",
    body: (
      <>
        <p>
          Isnad does not currently sell personal information and does not
          currently use third-party advertising trackers to build advertising
          profiles from your use of Isnad.
        </p>
        <p>
          If this changes in a way that materially affects your privacy, this
          policy will be updated before the new practice is applied where
          required.
        </p>
      </>
    ),
  },
  {
    title: "8. Retention and deletion",
    body: (
      <>
        <p>
          Persistent account information, conversations, preferences, saved
          content, learning records, and internal analytics may be retained for
          as long as reasonably needed to provide the service, maintain
          security, resolve disputes, meet legal obligations, and preserve
          legitimate operational records.
        </p>
        <p>
          Archiving or removing a conversation from active history does not
          necessarily mean the underlying database record is immediately and
          permanently erased.
        </p>
        <p>
          You may request access, correction, or deletion of personal
          information where applicable. Requests may require verification before
          we act on them, and some information may be retained when required or
          permitted by law.
        </p>
      </>
    ),
  },
  {
    title: "9. Security",
    body: (
      <>
        <p>
          Isnad uses technical safeguards intended to reduce unauthorized access
          and misuse. Telegram Mini App identity data is validated using
          Telegram's signed authentication data, sensitive application secrets
          are kept server-side, and application logging is designed to redact
          common secret-bearing fields.
        </p>
        <p>
          No online system can guarantee absolute security. You should use
          reasonable care when deciding what information to submit.
        </p>
      </>
    ),
  },
  {
    title: "10. Your privacy choices",
    body: (
      <ul>
        <li>Adjust available profile, language, display, citation, theme, and memory settings.</li>
        <li>Choose whether to use Isnad through the public web or an authenticated Telegram experience.</li>
        <li>Avoid submitting information that is not needed for your question.</li>
        <li>Request access, correction, or deletion where applicable law provides those rights.</li>
      </ul>
    ),
  },
  {
    title: "11. Children",
    body: (
      <p>
        Isnad is not intended to knowingly collect personal information from
        children in violation of applicable law. Telegram's own eligibility and
        account rules also apply when Isnad is used through Telegram. If you
        believe a child's information has been collected improperly, contact the
        project so the matter can be reviewed.
      </p>
    ),
  },
  {
    title: "12. International processing",
    body: (
      <p>
        Isnad and its service providers may process information in countries
        other than the country where you live. Privacy protections and legal
        requirements may differ by jurisdiction.
      </p>
    ),
  },
  {
    title: "13. Changes to this policy",
    body: (
      <p>
        We may update this Privacy Policy as Isnad changes. The effective date
        at the top of this page will be revised when the policy changes.
        Material changes may also be communicated through the site or other
        appropriate Isnad channels.
      </p>
    ),
  },
  {
    title: "14. Contact",
    body: (
      <>
        <p>
          For privacy questions, access requests, correction requests, or
          deletion requests, use the contact information published by the
          official Isnad project account.
        </p>
        <p>
          The current project profile is available at{" "}
          <a
            href="https://github.com/gwapupward-hub"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#e5c66f] underline decoration-[#e5c66f]/35 underline-offset-4 hover:text-[#f4dda0]"
          >
            github.com/gwapupward-hub
          </a>
          . Do not post passwords, private keys, seed phrases, API keys, or
          other secrets in a public issue or message.
        </p>
      </>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="landing-shell min-h-screen overflow-hidden text-white">
      <div className="landing-grid" aria-hidden="true" />
      <div className="landing-orb landing-orb-one" aria-hidden="true" />

      <header className="relative z-20 border-b border-white/[0.08] bg-[#050806]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-18 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-3" aria-label="Isnad home">
            <span className="isnad-mark" aria-hidden="true">
              <span />
            </span>
            <span className="font-display text-xl tracking-[-0.03em] text-white">Isnad</span>
          </Link>

          <Link
            href="/"
            className="rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/75 transition hover:border-white/25 hover:text-white"
          >
            Back to home
          </Link>
        </div>
      </header>

      <section className="relative z-10 mx-auto max-w-5xl px-5 pb-24 pt-16 sm:px-8 sm:pt-24">
        <div className="max-w-3xl">
          <p className="section-kicker">Legal & privacy</p>
          <h1 className="mt-4 font-display text-5xl tracking-[-0.05em] text-white sm:text-6xl">
            Privacy Policy
          </h1>
          <p className="mt-6 text-sm leading-7 text-white/55 sm:text-base">
            Effective September 27, 2026
          </p>
          <p className="mt-7 text-base leading-8 text-white/68 sm:text-lg">
            This policy explains what information Isnad processes, why it is
            used, and the choices available to you across the website, Telegram
            bot, and Telegram Mini App.
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-[#d7b55d]/20 bg-[#d7b55d]/[0.06] p-5 text-sm leading-7 text-white/65 sm:p-6">
          <strong className="text-[#efd58a]">Short version:</strong> Isnad uses
          account, conversation, preference, learning, and technical data to
          provide the service. AI questions are processed by OpenAI. Isnad does
          not currently sell personal information or run third-party advertising
          trackers.
        </div>

        <div className="mt-12 space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-white/[0.08] bg-[#090e0b]/78 p-5 shadow-[0_18px_60px_rgba(0,0,0,0.18)] sm:p-7"
            >
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-white">
                {section.title}
              </h2>
              <div className="privacy-copy mt-4 space-y-4 text-sm leading-7 text-white/58 sm:text-[15px]">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-white/[0.08] pt-8 text-sm text-white/45">
          <p>
            This page describes Isnad's current product behavior and is intended
            as a practical privacy notice. It is not legal advice.
          </p>
        </div>
      </section>
    </main>
  );
}
