"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseAnswer } from "@/lib/parseAnswer";
import SourceChain from "./SourceChain";
import CertaintyChip from "./CertaintyChip";

export default function AnswerMessage({
  content,
  routedToFinance,
  routedToTafsir,
  routedToHadith,
  routedToFiqh,
  routedToSeerah,
}: {
  content: string;
  routedToFinance?: boolean;
  routedToTafsir?: boolean;
  routedToHadith?: boolean;
  routedToFiqh?: boolean;
  routedToSeerah?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const { lead, tiers, certainty, structured } = parseAnswer(content);

  async function copy() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context) — leave the label unchanged.
    }
  }

  return (
    <div>
      <article className="rounded-2xl border border-[var(--pine)]/15 bg-[var(--parchment-soft)] px-5 py-4 shadow-sm sm:px-6 sm:py-5">
        {(certainty ||
          routedToFinance ||
          routedToTafsir ||
          routedToHadith ||
          routedToFiqh ||
          routedToSeerah) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {certainty && <CertaintyChip certainty={certainty} />}
            {routedToSeerah && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--pine-deep)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Seerah
              </span>
            )}
            {routedToFiqh && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--pine-deep)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Fiqh
              </span>
            )}
            {routedToHadith && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine-deep)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--pine-deep)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Hadith Sciences
              </span>
            )}
            {routedToTafsir && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/12 px-2.5 py-1 text-[11px] font-medium text-[var(--pine-deep)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Tafsīr (Qur&apos;an)
              </span>
            )}
            {routedToFinance && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--pine)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Muʿāmalāt (finance)
              </span>
            )}
          </div>
        )}

        <div className="prose prose-sm max-w-none sm:prose-base prose-headings:font-display prose-headings:font-medium prose-headings:text-[var(--pine-deep)] prose-h3:mb-1.5 prose-h3:mt-5 prose-h3:text-base prose-p:leading-relaxed prose-p:text-[var(--ink)] prose-strong:text-[var(--pine-deep)] prose-li:text-[var(--ink)] sm:prose-h3:text-lg">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{lead}</ReactMarkdown>
        </div>

        {structured && <SourceChain tiers={tiers} certainty={certainty} />}
      </article>

      <div className="mt-2 flex gap-3 pl-1">
        <button
          onClick={copy}
          className="rounded text-[11.5px] text-[var(--pine)]/50 transition-colors hover:text-[var(--pine)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gold)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
