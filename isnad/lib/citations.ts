import type { CitationRecord } from "@/lib/appTypes";

const MARKDOWN_LINK = /\[([^\]]+)]\((https:\/\/[^\s)]+)\)/g;
const BARE_URL = /https:\/\/[^\s)>]+/g;

function clean(value: string): string {
  return value.replace(/^[-*\d.)\s]+/, "").trim();
}

function inferSourceType(label: string): string {
  const normalized = label.toLowerCase();
  if (/qur['’]?an|surah|sūrah/.test(normalized)) return "quran";
  if (/bukhari|muslim|tirmidhi|nas[aā]['’]?i|abu dawud|ibn majah|hadith|ḥadīth/.test(normalized)) {
    return "hadith";
  }
  if (/tafsir|tafsīr/.test(normalized)) return "tafsir";
  if (/fiqh|madhhab|fatwa/.test(normalized)) return "fiqh";
  if (/seerah|sīrah/.test(normalized)) return "seerah";
  return "reference";
}

export function extractCitations(answer: string): CitationRecord[] {
  const citations: CitationRecord[] = [];
  const seen = new Set<string>();

  for (const match of answer.matchAll(MARKDOWN_LINK)) {
    const label = clean(match[1]);
    const url = match[2].replace(/[.,;:]$/, "");
    const key = `${label}|${url}`;
    if (!label || seen.has(key)) continue;
    seen.add(key);
    citations.push({
      ordinal: citations.length + 1,
      label,
      sourceType: inferSourceType(label),
      url,
      verified: false,
    });
  }

  const references = answer.match(/(?:^|\n)#{1,4}\s*(?:References|Sources)\s*\n([\s\S]*)$/i)?.[1];
  if (references) {
    for (const line of references.split("\n")) {
      const label = clean(line.replace(BARE_URL, ""));
      const url = line.match(BARE_URL)?.[0]?.replace(/[.,;:]$/, "");
      if (!label || label.length < 3) continue;
      const key = `${label}|${url ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      citations.push({
        ordinal: citations.length + 1,
        label,
        sourceType: inferSourceType(label),
        url,
        verified: false,
      });
    }
  }

  return citations.slice(0, 20).map((citation, index) => ({
    ...citation,
    ordinal: index + 1,
  }));
}
