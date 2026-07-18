import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

function readKnowledge(file: string): string {
  return fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
}

const CORE_SKILL = readKnowledge("core.md");
const MUAMALAT_SKILL = readKnowledge("muamalat.md");

// Keywords that route a question into the finance (Muʿāmalāt) add-on,
// per that plugin's own integration.md routing rules.
const FINANCE_KEYWORDS = [
  "riba", "ribā", "interest", "loan", "debt", "mortgage", "credit card",
  "bank", "zakah", "zakāh", "zakat", "invest", "stock", "crypto", "bitcoin",
  "defi", "staking", "token", "salary", "income", "halal money", "haram money",
  "business", "contract", "inheritance", "will", "trade", "trading",
  "murabaha", "murābaḥah", "mudarabah", "musharakah", "ijarah", "insurance",
  "tax", "gharar", "maysir", "gambling", "fraud", "ponzi", "wage", "earnings",
  "freelance", "commission", "rent", "lease", "partnership", "shares",
];

export function isFinanceQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return FINANCE_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * Builds the system prompt following the load order defined in the
 * Muʿāmalāt Expert plugin's integration.md:
 *   1. Load core skill.
 *   2. Load add-on skill (only when relevant).
 *   3. Core authority overrides the add-on wherever they conflict.
 */
export function buildSystemPrompt(question: string): string {
  const routeToFinance = isFinanceQuestion(question);

  const parts = [
    "# LOADED SKILL: Islamic Teacher Core (authoritative — see load order below)",
    CORE_SKILL,
  ];

  if (routeToFinance) {
    parts.push(
      "\n\n# LOADED SKILL: Muʿāmalāt Expert (finance add-on — depends on Core above)",
      MUAMALAT_SKILL,
      "\n\n# LOAD ORDER AND CONFLICT RULE\n" +
        "core authority > shared policy > add-on specialization\n" +
        "The add-on may add finance-specific detail but must never weaken the Core's " +
        "verification standards, hadith authentication rules, or safety/referral rules. " +
        "Apply the Core's Answer Format and confidence labels unless the add-on's more " +
        "detailed finance-specific Answer Format is a better fit for this question."
    );
  }

  parts.push(
    "\n\n# OPERATING CONTEXT\n" +
      "You are answering through a public website chat interface, not a private " +
      "consultation. Follow the Mandatory Method and Answer Format above for every " +
      "substantive question. For simple factual questions a shorter direct answer is fine, " +
      "but never skip the Internal Audit. Never fabricate citations. When uncertain, say so " +
      "plainly rather than guessing."
  );

  return parts.join("\n");
}
