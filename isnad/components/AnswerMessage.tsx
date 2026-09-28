"use client";

import { useEffect, useRef, useState } from "react";
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
  routedToAqidah,
  routedToArabic,
  routedToDawahTarbiyah,
  streaming = false,
}: {
  content: string;
  routedToFinance?: boolean;
  routedToTafsir?: boolean;
  routedToHadith?: boolean;
  routedToFiqh?: boolean;
  routedToSeerah?: boolean;
  routedToAqidah?: boolean;
  routedToArabic?: boolean;
  routedToDawahTarbiyah?: boolean;
  streaming?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(streaming);
  const streamedHereRef = useRef(streaming);
  const { lead, tiers, certainty, structured } = parseAnswer(content);

  useEffect(() => {
    if (!streaming) return;
    streamedHereRef.current = true;
    setExpanded(true);
  }, [streaming]);

  const longAnswer = lead.length > 1400;
  const canCollapse = longAnswer && !streaming;
  const collapsed = canCollapse && !expanded && !streamedHereRef.current;

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
      <article className="telegram-compact-card">
        {(certainty ||
          routedToFinance ||
          routedToTafsir ||
          routedToHadith ||
          routedToFiqh ||
          routedToSeerah ||
          routedToAqidah ||
          routedToArabic ||
          routedToDawahTarbiyah) && (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {certainty && <CertaintyChip certainty={certainty} />}
            {routedToDawahTarbiyah && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Daʿwah &amp; Tarbiyah
              </span>
            )}
            {routedToArabic && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Arabic Language
              </span>
            )}
            {routedToAqidah && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine-deep)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                ʿAqīdah
              </span>
            )}
            {routedToSeerah && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Seerah
              </span>
            )}
            {routedToFiqh && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/15 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Fiqh
              </span>
            )}
            {routedToHadith && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine-deep)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Hadith Sciences
              </span>
            )}
            {routedToTafsir && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--gold)]/12 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Tafsīr (Qur&apos;an)
              </span>
            )}
            {routedToFinance && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--pine)]/10 px-2.5 py-1 text-[11px] font-medium text-[var(--tg-text)]">
                <span className="star-8 inline-block h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
                Muʿāmalāt (finance)
              </span>
            )}
          </div>
        )}

        <div className={collapsed ? "telegram-answer-body telegram-answer-body-collapsed" : "telegram-answer-body"}>
          <div className="prose prose-sm max-w-none prose-headings:font-display prose-headings:font-medium prose-headings:text-[var(--tg-text)] prose-h3:mb-1.5 prose-h3:mt-4 prose-h3:text-base prose-p:my-2 prose-p:leading-relaxed prose-p:text-[var(--tg-text)] prose-strong:text-[var(--tg-text)] prose-li:text-[var(--tg-text)]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{lead}</ReactMarkdown>
          </div>
        </div>

        {canCollapse && (
          <button
            type="button"
            className="telegram-answer-toggle"
            aria-expanded={!collapsed}
            onClick={() => setExpanded((current) => !current)}
          >
            {collapsed ? "Show full answer" : "Show less"}
          </button>
        )}

        {structured && <SourceChain tiers={tiers} certainty={certainty} />}
      </article>

      <div className="mt-2 flex gap-3 pl-1">
        <button
          onClick={copy}
          className="rounded text-[11.5px] text-[var(--tg-text-muted)] transition-colors hover:text-[var(--tg-text)]"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
