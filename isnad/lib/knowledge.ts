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
const FIQH_SKILL = readKnowledge("fiqh.md");
const SEERAH_SKILL = readKnowledge("seerah.md");
const AQIDAH_SKILL = readKnowledge("aqidah.md");
const ARABIC_SKILL = readKnowledge("arabic.md");

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
  "qur'anic word", "qur’anic word", "grammar of this verse",
  "grammar of this ayah", "wording of this verse", "قرآن", "تفسير", "سورة", "آية",
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

// Fiqh routes practical legal questions across worship, family, daily conduct,
// madhhab comparison, and contemporary cases. Finance is included because
// Muʿāmalāt is the dedicated specialization beneath the shared Fiqh policy.
const FIQH_KEYWORDS = [
  "fiqh", "ruling", "fatwa", "halal", "ḥalāl", "haram", "ḥarām",
  "permissible", "prohibited", "forbidden", "obligatory", "recommended",
  "disliked", "makruh", "makrūh", "wajib", "wājib", "fard", "farḍ",
  "valid prayer", "invalid prayer", "valid fast", "invalid fast",
  "wudu", "wuḍū", "ghusl", "tayammum", "najasah", "impurity", "menstruation",
  "prayer", "salah", "ṣalāh", "rak'ah", "rakah", "rakʿah", "ruku", "rukūʿ",
  "sujud", "sujūd", "latecomer", "missed prayer", "imam",
  "fasting", "ramadan", "ramaḍān", "hajj", "umrah", "ʿumrah", "ihram", "iḥrām",
  "slaughter", "marriage", "nikah", "nikāḥ", "divorce", "talaq", "ṭalāq",
  "khul", "khulʿ", "custody", "inheritance", "estate", "bequest",
  "oath", "vow", "kaffarah", "kaffārah", "madhhab", "madhab",
  "hanafi", "ḥanafī", "maliki", "mālikī", "shafii", "shāfiʿī", "hanbali",
  "ḥanbalī", "ijma", "ijmāʿ", "qiyas", "qiyās", "usul al-fiqh",
  "uṣūl al-fiqh", "legal maxim", "necessity", "concession", "waswas", "waswās",
  "purification", "apostasy", "apostate", "takfir", "takfīr",
  "فقه", "حكم", "حلال", "حرام", "وضوء", "غسل", "صلاة", "صيام", "زكاة",
  "حج", "نكاح", "طلاق", "مذهب", "إجماع", "قياس",
];

export function isFiqhQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return isFinanceQuestion(question) || FIQH_KEYWORDS.some((kw) => q.includes(kw));
}

// Seerah owns historical reconstruction of the Prophet's ﷺ life and mission.
// Keep these triggers focused on biography, chronology, named events, campaigns,
// treaties, and relationships so a generic mention of Islam does not load it.
const SEERAH_KEYWORDS = [
  "seerah", "sīrah", "sirah", "prophetic biography", "life of the prophet",
  "life of prophet muhammad", "prophet muhammad's life", "prophet muhammad’s life",
  "who was prophet muhammad", "tell me about prophet muhammad",
  "prophet's childhood", "prophet’s childhood", "timeline of the prophet",
  "birth of the prophet", "year of the elephant", "before prophethood",
  "first revelation", "cave of hira", "ḥirā", "hira", "makkan period",
  "meccan period", "madinan period", "medinan period", "early muslims",
  "persecution in makkah", "migration to abyssinia", "hijrah", "hijra",
  "cave of thawr", "spider and dove", "aqabah", "ʿaqabah", "pledge of aqabah",
  "year of sorrow", "journey to taif", "journey to al-ta'if", "isra and mi'raj",
  "isrāʾ and miʿrāj", "night journey and ascension", "boycott of banu hashim",
  "constitution of madinah", "charter of madinah", "brotherhood in madinah",
  "battle of badr", "battle of uhud", "battle of the trench", "battle of khandaq",
  "battle of hunayn", "battle of mu'tah", "battle of mutah", "tabuk",
  "hudaybiyyah", "hudaibiyah", "conquest of makkah", "farewell pilgrimage",
  "farewell sermon", "final illness", "death of the prophet",
  "wives of the prophet", "children of the prophet", "mothers of the believers",
  "khadijah", "khadīja", "aisha", "ʿāʾishah", "aishah", "ahl al-bayt",
  "letters to rulers", "delegations to the prophet", "maghazi", "maghāzī",
  "ibn ishaq", "ibn isḥāq", "ibn hisham", "ibn hishām", "al-waqidi", "al-wāqidī",
  "سيرة", "الهجرة", "بدر", "أحد", "الخندق", "الحديبية", "فتح مكة",
];

export function isSeerahQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return SEERAH_KEYWORDS.some((kw) => q.includes(kw));
}

// ʿAqīdah owns doctrinal explanation. Keep these triggers focused on creed,
// theological claims, and matters of the unseen; generic mentions of Allah,
// Islam, faith, the Prophet ﷺ, or Sunnah should remain with the Core.
const AQIDAH_KEYWORDS = [
  "aqidah", "ʿaqīdah", "aqeedah", "creed", "islamic theology", "usul al-din",
  "uṣūl al-dīn", "tawhid", "tawḥīd", "shirk", "rububiyyah", "rubūbiyyah",
  "uluhiyyah", "ulūhiyyah", "asma wa sifat", "asmāʾ wa ṣifāt",
  "names and attributes of allah", "allah's attribute", "allah’s attribute",
  "divine attributes", "attribute of allah", "how is allah", "where is allah",
  "istiwa", "istiwā", "allah's speech", "allah’s speech", "seeing allah",
  "iman", "īmān", "increases and decreases", "major kufr", "minor kufr",
  "kufr akbar", "kufr asghar", "nifaq", "nifāq", "hypocrisy in belief",
  "fitrah", "fiṭrah", "nullifier of islam", "nullifiers of islam",
  "apostasy", "apostate", "takfir", "takfīr", "declare someone a kafir",
  "declare someone kafir",
  "qadar", "qadr", "divine decree", "predestination", "free will in islam",
  "allah decree", "allah decreed", "why does allah allow", "problem of evil",
  "guidance and misguidance", "reliance on allah", "tawakkul",
  "prophethood", "nubuwwah", "nubuwwa", "finality of prophethood",
  "seal of the prophets", "revelation from allah", "wahy", "waḥy",
  "isra and mi'raj", "isrāʾ and miʿrāj", "night journey and ascension",
  "angels", "angel jibril", "angel gabriel", "jinn", "djinn", "unseen",
  "al-ghayb", "ghayb",
  "grave punishment", "punishment of the grave", "life in the grave", "barzakh",
  "resurrection", "day of judgment", "judgement day", "signs of the hour",
  "end times", "dajjal", "dajjāl", "mahdi", "mahdī", "intercession",
  "shafa'ah", "shafāʿah", "paradise and hell", "jannah and jahannam",
  "miracle", "miracles", "karamah", "karāmah", "dream means", "dream in islam",
  "ashari", "ashʿarī", "maturidi", "māturīdī", "athari", "atharī",
  "salafi creed", "ahl al-sunnah", "ahlus sunnah", "sunni theology",
  "mu'tazila", "muʿtazila", "murjiah", "murji'ah", "murjiʾah", "khawarij",
  "kharijites", "jahmiyyah", "qadariyyah", "jabriyyah", "rafidah", "rāfiḍah",
  "intrusive thoughts about allah", "doubts about faith", "doubt my faith",
  "am i still muslim", "did i leave islam", "religious waswas",
  "عقيدة", "توحيد", "شرك", "إيمان", "كفر", "نفاق", "أسماء وصفات", "قدر",
  "نبوة", "وحي", "ملائكة", "جن", "غيب", "قيامة", "شفاعة", "تكفير",
];

export function isAqidahQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return AQIDAH_KEYWORDS.some((kw) => q.includes(kw));
}

// Arabic Language Expert owns linguistic analysis, not every question that
// happens to contain an Arabic religious term. Route only focused requests
// about wording, translation, grammar, morphology, rhetoric, text form,
// register, dialect, or language-based interpretive claims.
const ARABIC_KEYWORDS = [
  "arabic language", "quranic arabic", "qur'anic arabic", "qur’anic arabic",
  "classical arabic", "modern standard arabic", "msa arabic", "arabic grammar",
  "arabic morphology", "arabic syntax", "arabic rhetoric", "arabic imperative",
  "imperative in arabic", "arabic vocabulary",
  "arabic word", "arabic phrase", "arabic sentence", "arabic text",
  " in arabic", "from arabic",
  "translate from arabic", "translate into arabic", "translate this arabic",
  "translation of the arabic", "what does this mean in arabic",
  "what does this arabic mean", "meaning in arabic", "literal arabic",
  "i'rab", "iʿrāb", "iraab", "nahw", "naḥw", "sarf", "ṣarf",
  "root letters", "triliteral root", "arabic root", "root fallacy",
  "verb form", "form ii", "form iii", "form iv", "form v", "form vi",
  "form vii", "form viii", "form ix", "form x", "case ending",
  "accusative case", "nominative case", "genitive case", "jussive mood",
  "subjunctive mood", "diacritize", "diacritization", "vocalize this",
  "vocalization", "tashkeel", "tashkīl", "transliterate", "transliteration",
  "balaghah", "balāghah", "arabic eloquence", "arabic lexicon",
  "arabic dictionary", "semantic range", "arabic etymology",
  "arabic pronunciation", "arabic spelling", "arabic calligraphy",
  "arabic poetry", "arabic prose", "arabic learner", "learn arabic",
  "teach me arabic", "correct my arabic", "is this correct arabic",
  "arabic dialect", "egyptian arabic", "levantine arabic", "gulf arabic",
  "khaleeji arabic", "maghrebi arabic", "iraqi arabic", "hijazi arabic",
  "sudanese arabic", "yemeni arabic", "fusha", "fuṣḥā", "ammiyya", "ʿāmmiyyah",
  "grammar of this verse", "grammar of this ayah", "wording of this verse",
  "wording of this hadith", "arabic wording", "linguistic analysis",
  "لغة عربية", "العربية الفصحى", "النحو", "الصرف", "الإعراب",
  "إعراب", "بلاغة", "جذر الكلمة", "وزن الكلمة", "تشكيل", "ترجمة",
  "ترجم", "ما معنى", "ماذا تعني", "لهجة", "فصحى", "عامية",
];

const ARABIC_SCRIPT = /[\u0600-\u06ff]/;
const ARABIC_LANGUAGE_INTENT =
  /\b(?:analy[sz]e|correct|define|diacritize|gloss|meaning|parse|pronounce|translate|transliterate|vocalize)\b/;

export function isArabicQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    ARABIC_KEYWORDS.some((kw) => q.includes(kw)) ||
    (ARABIC_SCRIPT.test(question) && ARABIC_LANGUAGE_INTENT.test(q))
  );
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
  const routeToFiqh = isFiqhQuestion(question);
  const routeToSeerah = isSeerahQuestion(question);
  const routeToAqidah = isAqidahQuestion(question);
  const routeToArabic = isArabicQuestion(question);

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

  if (routeToSeerah) {
    parts.push(
      "\n\n# LOADED SKILL: Seerah Expert (historical reconstruction add-on — depends on Core and shared source policy)",
      SEERAH_SKILL
    );
  }

  if (routeToAqidah) {
    parts.push(
      "\n\n# LOADED SKILL: ʿAqīdah Expert (creed add-on — depends on Core and shared source/hadith policy)",
      AQIDAH_SKILL
    );
  }

  if (routeToArabic) {
    parts.push(
      "\n\n# LOADED SKILL: Arabic Language Expert (linguistic analysis add-on — depends on Core and shared source policy)",
      ARABIC_SKILL
    );
  }

  if (routeToFiqh) {
    parts.push(
      "\n\n# LOADED SKILL: Fiqh Expert (jurisprudence add-on — depends on Core and shared source policy)",
      FIQH_SKILL
    );
  }

  if (routeToFinance) {
    parts.push(
      "\n\n# LOADED SKILL: Muʿāmalāt Expert (financial specialization — depends on Fiqh Expert above)",
      MUAMALAT_SKILL
    );
  }

  if (
    routeToHadith ||
    routeToTafsir ||
    routeToSeerah ||
    routeToAqidah ||
    routeToArabic ||
    routeToFiqh ||
    routeToFinance
  ) {
    parts.push(
      "\n\n# LOAD ORDER AND CONFLICT RULE\n" +
        "Islamic Teacher Core > shared source and hadith policy. " +
        "Seerah Expert owns historical reconstruction; Hadith Sciences owns report authentication; " +
        "Tafsīr Expert owns Qur'anic interpretation; ʿAqīdah Expert owns doctrinal explanation; " +
        "Arabic Language Expert owns linguistic analysis while preserving material ambiguity; " +
        "Fiqh Expert owns legal derivation and worldly legal consequences; " +
        "Muʿāmalāt is the financial specialization beneath Fiqh Expert.\n" +
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
