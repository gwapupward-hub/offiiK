import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Certainty, Tier } from "@/lib/parseAnswer";

/**
 * The "Traced through" chain: the evidence behind an answer, in isnād order.
 * Uses native <details> so it's keyboard-operable and expandable without JS.
 * The Qur'an tier opens by default — the Core skill puts it first for a reason.
 */
export default function SourceChain({
  tiers,
  certainty,
}: {
  tiers: Tier[];
  certainty: Certainty | null;
}) {
  if (tiers.length === 0) return null;

  return (
    <section className="mt-4 border-t border-dashed border-[var(--pine)]/20 pt-3.5">
      <h4 className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--pine)]/50">
        Traced through
      </h4>

      <div className="flex flex-col gap-1.5">
        {tiers.map((tier, i) => (
          <details
            key={tier.key}
            open={i === 0}
            className="group overflow-hidden rounded-[10px] border border-[var(--pine)]/12 bg-white/50"
          >
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium text-[var(--pine-deep)] hover:bg-[var(--pine)]/[0.03] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--gold)] [&::-webkit-details-marker]:hidden">
              <span className="star-8 h-[9px] w-[9px] shrink-0 bg-[var(--gold)]" aria-hidden="true" />
              <span className="flex-1">{tier.label}</span>
              <svg
                className="h-2.5 w-2.5 shrink-0 text-[var(--pine)]/40 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                viewBox="0 0 8 12"
                fill="none"
                aria-hidden="true"
              >
                <path d="M1.5 1L6.5 6L1.5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </summary>
            <div className="prose prose-sm max-w-none border-l-2 border-[var(--gold-soft)] pb-3 pl-2.5 pr-3 text-[12.5px] leading-[1.55] prose-p:my-1.5 prose-p:text-[var(--ink)]/85 prose-strong:text-[var(--pine)] prose-li:my-0.5 prose-li:text-[var(--ink)]/85 ml-[31px]">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{tier.body}</ReactMarkdown>
            </div>
          </details>
        ))}
      </div>

      {certainty?.note && (
        <p className="mt-2.5 text-[12px] leading-relaxed text-[var(--ink)]/60">{certainty.note}</p>
      )}
    </section>
  );
}
