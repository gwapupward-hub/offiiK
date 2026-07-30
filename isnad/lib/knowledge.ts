import fs from "fs";
import path from "path";

const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge");

function readKnowledge(file: string): string {
  return fs.readFileSync(path.join(KNOWLEDGE_DIR, file), "utf-8");
}

const CORE_SKILL = readKnowledge("core.md");
const MUAMALAT_SKILL = readKnowledge("muamalat.md");
const TAFSIR_SKILL = readKnowledge("tafsir.md");
const HADITH_SKILL = readKnowledge("hadith.md");

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

// Terms that indicate the user is asking for Qur'anic explanation rather than
// only mentioning Islam generally. Numbered references (for example, 2:255)
// are included because they are a common way to request an āyah directly.
const TAFSIR_KEYWORDS = [
  "quran", "qur'an", "qur’an", "koran", "tafsir", "tafsīr",
  "surah", "sura", "sūrah", "ayah", "ayat", "āyah", "āyāt",
  "asbab al-nuzul", "asbāb al-nuzūl", "occasion of revelation",
  "reason for revelation", "makki", "makkan", "madani", "madinan",
  "qiraat", "qirāʾāt", "recitation variant", "abrogated verse",
  "nasikh", "mansukh", "nāsikh", "mansūkh", "ibn kathir", "ibn kathīr",
  "al-tabari", "al-ṭabarī", "al-qurtubi", "al-qurṭubī",
  "explain this verse", "meaning of this verse", "quranic word",
  "qur'anic word", "qur’anic word", "قرآن", "تفسير", "سورة", "آية",
];

const QURAN_REFERENCE = /\b(?:[1-9]|[1-9]\d|1(?:0\d|1[0-4])):\d{1,3}\b/;

export function isTafsirQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return TAFSIR_KEYWORDS.some((kw) => q.includes(kw)) || QURAN_REFERENCE.test(q);
}

// Hadith Sciences is reserved for source-tracing and authentication work. Keep
// this narrower than general Sunnah questions so ordinary guidance stays with
// the Core unless the user is asking about a report, chain, narrator, or grade.
const HADITH_KEYWORDS = [
  "hadith", "hadeeth", "ḥadīth", "isnad", "isnād", "sanad", "matn",
  "chain of narration", "chain of transmission", "narrator", "narrated by",
  "takhrij", "takhrīj", "grade this", "grading of", "authentic narration",
  "authentic report", "weak narration", "weak hadith", "fabricated hadith",
  "false hadith", "sahih", "ṣaḥīḥ", "hasan", "ḥasan", "daif", "ḍaʿīf",
  "mawdu", "mawḍūʿ", "marfu", "marfūʿ", "mawquf", "mawqūf", "maqtu",
  "maqṭūʿ", "mursal", "muallaq", "muʿallaq", "mutawatir", "mutawātir",
  "ahad hadith", "khabar al-wahid", "jarh wa tadil", "jarḥ wa taʿdīl",
  "ilm al-rijal", "ʿilm al-rijāl", "hidden defect", "illah", "ʿillah",
  "shadh", "shādhdh", "tadlis", "tadlīs", "mudallas", "hadith number",
  "bukhari", "bukhārī", "sahih muslim", "ṣaḥīḥ muslim", "muslim hadith",
  "tirmidhi", "tirmidhī", "abu dawud",
  "abū dāwūd", "nasai", "nasāʾī", "ibn majah", "ibn mājah", "musnad ahmad",
  "musnad aḥmad", "muwatta", "muwaṭṭa", "حديث", "إسناد", "سند", "متن",
  "صحيح", "حسن", "ضعيف", "موضوع", "تخريج", "علل",
];

export function isHadithQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return HADITH_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * Builds the system prompt following the load order defined in the
 * add-on integration rules:
 *   1. Load core skill.
 *   2. Load each relevant add-on skill.
 *   3. Core authority overrides the add-on wherever they conflict.
 */
export function buildSystemPrompt(question: string): string {
  const routeToFinance = isFinanceQuestion(question);
  const routeToTafsir = isTafsirQuestion(question);
  const routeToHadith = isHadithQuestion(question);

  const parts = [
    "# LOADED SKILL: Islamic Teacher Core (authoritative — see load order below)",
    CORE_SKILL,
  ];

  if (routeToHadith) {
    parts.push(
      "\n\n# LOADED SKILL: Hadith Sciences Expert (authentication add-on — depends on Core above)",
      HADITH_SKILL
    );
  }

  if (routeToTafsir) {
    parts.push(
      "\n\n# LOADED SKILL: Tafsīr Expert (Qur'an add-on — depends on Core above)",
      TAFSIR_SKILL
    );
  }

  if (routeToFinance) {
    parts.push(
      "\n\n# LOADED SKILL: Muʿāmalāt Expert (finance add-on — depends on Core above)",
      MUAMALAT_SKILL
    );
  }

  if (routeToHadith || routeToTafsir || routeToFinance) {
    parts.push(
      "\n\n# LOAD ORDER AND CONFLICT RULE\n" +
        "core authority > shared policy > add-on specialization\n" +
        "Each add-on may add domain-specific detail but must never weaken the Core's " +
        "verification standards, hadith authentication rules, or safety/referral rules. " +
        "When multiple add-ons are loaded, combine their relevant analysis without letting " +
        "either add-on override the Core or the other add-on outside its specialty. " +
        "Apply the Core's Answer Format and confidence labels unless a loaded add-on's more " +
        "specific Answer Format is a better fit for the question."
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
