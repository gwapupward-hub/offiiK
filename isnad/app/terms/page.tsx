import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "Terms governing use of the Isnad website, AI assistant, Telegram bot, and Telegram Mini App.",
  alternates: {
    canonical: "/terms",
  },
};

const sections = [
  {
    title: "1. Agreement to these terms",
    body: (
      <>
        <p>
          These Terms of Service govern your use of Isnad, including the Isnad
          website, AI assistant, Telegram bot, Telegram Mini App, saved
          conversations, learning tools, library features, and related services.
        </p>
        <p>
          By accessing or using Isnad, you agree to these Terms and the{" "}
          <Link
            href="/privacy"
            className="text-[#e5c66f] underline decoration-[#e5c66f]/35 underline-offset-4 hover:text-[#f4dda0]"
          >
            Privacy Policy
          </Link>
          . If you do not agree, do not use the service.
        </p>
      </>
    ),
  },
  {
    title: "2. What Isnad provides",
    body: (
      <>
        <p>
          Isnad is an AI-assisted Islamic knowledge platform designed to help
          users research and learn from source-traced material, including the
          Qur'an, authentic Sunnah, the understanding of the Companions, and
          recognized Sunni scholarship.
        </p>
        <p>
          Isnad may provide AI-generated explanations, citations, summaries,
          learning tools, saved research, and related features. Features may
          change, improve, be limited, or be removed as the service develops.
        </p>
      </>
    ),
  },
  {
    title: "3. Islamic knowledge and religious guidance",
    body: (
      <>
        <p>
          Isnad is a research and learning tool. It is not a replacement for a
          qualified scholar, mufti, imam, judge, counselor, or other trusted
          authority who can evaluate your full circumstances.
        </p>
        <p>
          AI-generated answers can be incomplete, mistaken, or based on a
          misunderstanding of your question. Citations, hadith gradings,
          scholarly attributions, legal conclusions, and claims of consensus or
          disagreement should be verified before you rely on them for important
          decisions.
        </p>
        <p>
          Questions involving marriage, divorce, inheritance, criminal matters,
          personal safety, medical treatment, financial contracts, binding
          religious rulings, or other high-stakes situations should be reviewed
          with an appropriately qualified human authority.
        </p>
      </>
    ),
  },
  {
    title: "4. Eligibility and Telegram use",
    body: (
      <>
        <p>
          You must be legally able to agree to these Terms in your jurisdiction.
          If you use Isnad through Telegram, you must also comply with
          Telegram's applicable terms, eligibility requirements, and platform
          rules.
        </p>
        <p>
          You are responsible for activity performed through your Telegram
          account or other authenticated access to Isnad.
        </p>
      </>
    ),
  },
  {
    title: "5. Accounts, identity, and saved data",
    body: (
      <>
        <p>
          Some Isnad features use Telegram-signed authentication to associate
          your Telegram identity with an Isnad account. Authenticated features
          may save conversations, profile information, preferences, notes,
          bookmarks, citations, learning progress, and related records.
        </p>
        <p>
          You are responsible for keeping access to your Telegram account and
          devices secure. Do not attempt to impersonate another person, bypass
          authentication, or access another user's account or saved content.
        </p>
      </>
    ),
  },
  {
    title: "6. Acceptable use",
    body: (
      <>
        <p>You may not use Isnad to:</p>
        <ul>
          <li>Break applicable law or facilitate unlawful activity.</li>
          <li>Interfere with, overload, probe, or disrupt Isnad's systems.</li>
          <li>Bypass access controls, authentication, rate limits, or security measures.</li>
          <li>Attempt to obtain another user's private information or account data.</li>
          <li>Upload or transmit malware, malicious code, or harmful automated traffic.</li>
          <li>Misrepresent AI-generated output as an official fatwa, court ruling, or statement from a named scholar or institution when it is not one.</li>
          <li>Use the service in a way that infringes the rights of others.</li>
        </ul>
        <p>
          Reasonable research, criticism, comparative study, and good-faith
          testing are permitted so long as they do not violate these Terms or
          compromise the service or other users.
        </p>
      </>
    ),
  },
  {
    title: "7. Your content",
    body: (
      <>
        <p>
          You retain whatever rights you have in questions, notes, profile text,
          and other content you submit to Isnad.
        </p>
        <p>
          You give Isnad permission to process that content as necessary to
          operate the service, generate responses, save requested history,
          provide search and learning features, maintain security, and improve
          reliability. This permission is limited to operating and supporting
          Isnad and does not transfer ownership of your content to Isnad.
        </p>
      </>
    ),
  },
  {
    title: "8. AI-generated output",
    body: (
      <>
        <p>
          AI-generated responses are produced automatically and may not be
          unique. Other users may receive similar or identical explanations.
        </p>
        <p>
          You are responsible for evaluating output before relying on,
          publishing, teaching from, acting on, or redistributing it. Where a
          response cites a source, the underlying source—not the AI wording—
          remains the authority to verify.
        </p>
      </>
    ),
  },
  {
    title: "9. Third-party services",
    body: (
      <>
        <p>
          Isnad relies on third-party services including Telegram, OpenAI,
          Vercel, and database or infrastructure providers. Your use of those
          services may also be governed by their own terms and policies.
        </p>
        <p>
          Isnad is not responsible for outages, policy changes, account actions,
          data practices, or other conduct controlled by third-party providers.
        </p>
      </>
    ),
  },
  {
    title: "10. Intellectual property",
    body: (
      <>
        <p>
          The Isnad name, product design, software, original interface elements,
          original documentation, and other project-created materials are
          protected by applicable intellectual-property law except where
          expressly licensed otherwise.
        </p>
        <p>
          Qur'anic text, hadith collections, classical works, translations,
          commentaries, and other source materials may have separate public
          domain, publisher, translator, database, or licensing rights. Isnad
          does not claim ownership of third-party source material merely because
          it is referenced by the service.
        </p>
      </>
    ),
  },
  {
    title: "11. Open-source software",
    body: (
      <p>
        Portions of Isnad may be released under an open-source license. Where an
        open-source license applies to specific code, that license governs your
        rights to use, copy, modify, or distribute that code and takes priority
        over conflicting provisions of these Terms for that code.
      </p>
    ),
  },
  {
    title: "12. Service availability and changes",
    body: (
      <>
        <p>
          Isnad is an evolving service. We may modify, suspend, restrict, or
          discontinue features, integrations, models, limits, or parts of the
          service at any time.
        </p>
        <p>
          We do not guarantee uninterrupted availability, permanent storage of
          any conversation or note, or continued compatibility with every
          Telegram, browser, device, AI model, or third-party service.
        </p>
      </>
    ),
  },
  {
    title: "13. Suspension and termination",
    body: (
      <>
        <p>
          Access may be limited or suspended when reasonably necessary to
          protect Isnad, users, service providers, or third parties; investigate
          misuse; comply with law; or enforce these Terms.
        </p>
        <p>
          You may stop using Isnad at any time. Requests concerning stored
          personal information are handled as described in the Privacy Policy.
        </p>
      </>
    ),
  },
  {
    title: "14. No warranties",
    body: (
      <p>
        To the maximum extent permitted by law, Isnad is provided on an
        "as-is" and "as-available" basis. We do not promise that every response,
        citation, interpretation, feature, or source reference will be accurate,
        complete, current, uninterrupted, secure, or suitable for a particular
        purpose.
      </p>
    ),
  },
  {
    title: "15. Limitation of liability",
    body: (
      <p>
        To the maximum extent permitted by applicable law, Isnad and its
        project contributors will not be liable for indirect, incidental,
        special, consequential, exemplary, or punitive damages, or for losses
        arising from reliance on AI-generated output, loss of data, service
        interruption, third-party services, or unauthorized account access.
        Nothing in these Terms excludes liability that cannot legally be
        excluded.
      </p>
    ),
  },
  {
    title: "16. Responsibility for your use",
    body: (
      <p>
        You are responsible for your use of Isnad, the questions and content you
        submit, and decisions you make based on the service. You should use
        independent judgment and appropriate human expertise for important
        religious, legal, medical, financial, safety, or personal decisions.
      </p>
    ),
  },
  {
    title: "17. Changes to these terms",
    body: (
      <p>
        These Terms may be updated as Isnad changes. The effective date at the
        top of this page will be revised when the Terms change. Continued use of
        Isnad after updated Terms become effective means the updated Terms
        govern your subsequent use, to the extent permitted by law.
      </p>
    ),
  },
  {
    title: "18. General terms",
    body: (
      <>
        <p>
          If any provision of these Terms is found unenforceable, the remaining
          provisions will continue to apply. Failure to enforce a provision does
          not waive the right to enforce it later.
        </p>
        <p>
          These Terms do not override rights you may have under mandatory
          consumer-protection, privacy, or other applicable laws.
        </p>
      </>
    ),
  },
  {
    title: "19. Contact",
    body: (
      <>
        <p>
          Questions about these Terms may be directed to the official Isnad
          project account.
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
          . Do not publish passwords, private keys, wallet seed phrases, API
          keys, or other secrets in a public issue or message.
        </p>
      </>
    ),
  },
];

export default function TermsPage() {
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
          <p className="section-kicker">Legal & use</p>
          <h1 className="mt-4 font-display text-5xl tracking-[-0.05em] text-white sm:text-6xl">
            Terms of Service
          </h1>
          <p className="mt-6 text-sm leading-7 text-white/55 sm:text-base">
            Effective September 27, 2026
          </p>
          <p className="mt-7 text-base leading-8 text-white/68 sm:text-lg">
            These Terms explain the rules for using Isnad and the limits of an
            AI-assisted Islamic knowledge service.
          </p>
        </div>

        <div className="mt-12 rounded-2xl border border-[#d7b55d]/20 bg-[#d7b55d]/[0.06] p-5 text-sm leading-7 text-white/65 sm:p-6">
          <strong className="text-[#efd58a]">Important:</strong> Isnad is built
          to make evidence visible, but AI can still make mistakes. For
          high-stakes religious rulings or personal decisions, verify the
          evidence and consult a qualified human authority.
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

        <div className="mt-12 flex flex-wrap gap-4 border-t border-white/[0.08] pt-8 text-sm text-white/45">
          <Link href="/privacy" className="hover:text-white">
            Privacy Policy
          </Link>
          <Link href="/" className="hover:text-white">
            Isnad home
          </Link>
        </div>
      </section>
    </main>
  );
}
