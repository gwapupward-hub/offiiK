import type { Certainty, CertaintyLevel } from "@/lib/parseAnswer";

/**
 * Surfaces the "Degree of Certainty" the Core skill already requires the model
 * to state. Colour encodes how settled the matter is — this is the single most
 * decision-relevant fact in an answer, so it sits at the top of the card.
 */
const STYLES: Record<CertaintyLevel, { bg: string; fg: string; ring: string }> = {
  established: { bg: "bg-[#123832]/10", fg: "text-[var(--pine-deep)]", ring: "ring-[var(--pine)]/20" },
  majority: { bg: "bg-[#123832]/[0.06]", fg: "text-[var(--pine)]", ring: "ring-[var(--pine)]/15" },
  disagreement: { bg: "bg-[#b8892f]/12", fg: "text-[#7a5a12]", ring: "ring-[var(--gold)]/30" },
  limited: { bg: "bg-[#b8892f]/[0.08]", fg: "text-[#7a5a12]", ring: "ring-[var(--gold)]/20" },
  unverified: { bg: "bg-[#8a1f1f]/[0.07]", fg: "text-[#7a1f1f]", ring: "ring-[#8a1f1f]/20" },
};

export default function CertaintyChip({ certainty }: { certainty: Certainty }) {
  const s = STYLES[certainty.level];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${s.bg} ${s.fg} ${s.ring}`}
    >
      <span className="sr-only">Degree of certainty: </span>
      {certainty.label}
    </span>
  );
}
