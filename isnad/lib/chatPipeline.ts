import type { RoutingFlags, UserSettings } from "@/lib/appTypes";
import {
  buildSystemPrompt,
  isAqidahQuestion,
  isArabicQuestion,
  isDawahTarbiyahQuestion,
  isFinanceQuestion,
  isFiqhQuestion,
  isHadithQuestion,
  isSeerahQuestion,
  isTafsirQuestion,
} from "@/lib/knowledge";

export function routeQuestion(question: string): RoutingFlags {
  return {
    routedToFinance: isFinanceQuestion(question),
    routedToTafsir: isTafsirQuestion(question),
    routedToHadith: isHadithQuestion(question),
    routedToFiqh: isFiqhQuestion(question),
    routedToSeerah: isSeerahQuestion(question),
    routedToAqidah: isAqidahQuestion(question),
    routedToArabic: isArabicQuestion(question),
    routedToDawahTarbiyah: isDawahTarbiyahQuestion(question),
  };
}

export function buildConfiguredPrompt(question: string, settings: UserSettings): string {
  const answerLength = {
    concise: "Keep the answer concise while retaining the decisive evidence and qualification.",
    balanced: "Use a balanced level of detail.",
    detailed: "Give a detailed explanation with the relevant evidence and recognized disagreement.",
  }[settings.answerLength];

  return `${buildSystemPrompt(question)}

USER RESPONSE SETTINGS
- Preferred language: ${settings.language}
- Answer length: ${answerLength}
- Include Arabic source text: ${settings.showArabic ? "yes, when verified and useful" : "no unless necessary"}
- Include transliteration: ${settings.transliteration ? "yes, where useful" : "no by default"}
- Madhhab context: ${settings.madhhabContext}
- Citation depth: ${settings.citationDepth}

CITATION REQUIREMENTS
- Never fabricate a verse, hadith number, grading, quotation, scholar, book, or URL.
- Cite only sources you can identify with confidence.
- Distinguish Qur'an, Prophetic hadith, Companion reports, and scholarly commentary.
- End sourced religious answers with a concise “### References” section.
- When a citation cannot be verified, state that plainly instead of guessing.
- Stored references are audited separately and are not automatically marked verified.`;
}
