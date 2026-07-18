/**
 * Parses an answer into the structure the Islamic Teacher Core skill already
 * mandates in its "Answer Format" section, so the UI can present the isnād
 * chain without any change to the system prompt.
 *
 * The skill instructs the model to use these headings:
 *   ### Ruling or Main Answer
 *   ### Evidence from the Qur'an
 *   ### Evidence from the Sunnah
 *   ### Understanding of the Companions
 *   ### Scholarly Explanation
 *   ### Practical Guidance
 *   ### Degree of Certainty
 *
 * The skill says "when appropriate", so short factual answers may skip it
 * entirely. When no recognizable headings are found, `structured` is false and
 * the caller should fall back to rendering the raw markdown.
 */

export type TierKey = "quran" | "sunnah" | "companions" | "scholars";

export type Tier = {
  key: TierKey;
  label: string;
  body: string;
};

export type CertaintyLevel =
  | "established"
  | "majority"
  | "disagreement"
  | "limited"
  | "unverified";

export type Certainty = {
  level: CertaintyLevel;
  label: string;
  /** Any extra prose the model wrote under the heading, beyond the enum value. */
  note: string | null;
};

export type ParsedAnswer = {
  /** Main answer + practical guidance — rendered as the visible body. */
  lead: string;
  /** Evidence tiers, in isnād order. Only tiers with real content are included. */
  tiers: Tier[];
  certainty: Certainty | null;
  /** False when the model didn't use the mandated headings. */
  structured: boolean;
};

const TIER_LABELS: Record<TierKey, string> = {
  quran: "Qur'an",
  sunnah: "Sunnah",
  companions: "Companions",
  scholars: "Scholars",
};

const TIER_ORDER: TierKey[] = ["quran", "sunnah", "companions", "scholars"];

const CERTAINTY_MATCHERS: { level: CertaintyLevel; label: string; test: string }[] = [
  { level: "established", label: "Clear and established", test: "clearandestablished" },
  { level: "majority", label: "Strong majority position", test: "strongmajority" },
  { level: "disagreement", label: "Legitimate scholarly disagreement", test: "scholarlydisagreement" },
  { level: "limited", label: "Evidence is limited", test: "evidenceislimited" },
  { level: "unverified", label: "Could not verify", test: "couldnotverify" },
];

/**
 * Lowercases and strips diacritics, apostrophes and spaces so that
 * "Evidence from the Qur'an", "Evidence from the Quran" and
 * "Evidence from the Qurʾān" all collapse to the same key.
 */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

type Section = { heading: string; body: string };

function splitSections(markdown: string): { preamble: string; sections: Section[] } {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  const preambleLines: string[] = [];

  let current: Section | null = null;

  for (const line of lines) {
    const match = /^\s{0,3}#{2,4}\s+(.+?)\s*#*\s*$/.exec(line);
    if (match) {
      if (current) sections.push(current);
      current = { heading: match[1], body: "" };
    } else if (current) {
      current.body += line + "\n";
    } else {
      preambleLines.push(line);
    }
  }
  if (current) sections.push(current);

  return { preamble: preambleLines.join("\n").trim(), sections };
}

function classify(heading: string): TierKey | "certainty" | "guidance" | "lead" | "other" {
  const h = normalize(heading);
  if (h.includes("quran")) return "quran";
  if (h.includes("sunnah") || h.includes("hadith")) return "sunnah";
  if (h.includes("companion") || h.includes("sahabah")) return "companions";
  if (h.includes("scholar")) return "scholars";
  if (h.includes("certainty") || h.includes("confidence")) return "certainty";
  if (h.includes("guidance") || h.includes("practical")) return "guidance";
  if (h.includes("answer") || h.includes("ruling")) return "lead";
  return "other";
}

function parseCertainty(body: string): Certainty | null {
  const flat = normalize(body);
  const hit = CERTAINTY_MATCHERS.find((c) => flat.includes(c.test));
  if (!hit) return null;

  // The chip already states the level, so drop the sentence carrying it and
  // keep only any additional reasoning the model offered.
  const sentences = body.match(/[^.!?]+[.!?]*/g) ?? [body];
  const note =
    sentences
      .filter((s) => !normalize(s).includes(hit.test))
      .join(" ")
      .trim() || null;

  return { level: hit.level, label: hit.label, note };
}

export function parseAnswer(markdown: string): ParsedAnswer {
  const { preamble, sections } = splitSections(markdown ?? "");

  const tierBodies: Partial<Record<TierKey, string>> = {};
  const leadParts: string[] = [];
  let guidance = "";
  let certainty: Certainty | null = null;
  let sawMandatedHeading = false;

  if (preamble) leadParts.push(preamble);

  for (const section of sections) {
    const kind = classify(section.heading);
    const body = section.body.trim();

    if (kind === "certainty") {
      sawMandatedHeading = true;
      certainty = parseCertainty(body);
      continue;
    }
    if (kind === "guidance") {
      sawMandatedHeading = true;
      if (body) guidance = body;
      continue;
    }
    if (kind === "lead") {
      sawMandatedHeading = true;
      if (body) leadParts.push(body);
      continue;
    }
    if (kind === "other") {
      // Unrecognized heading — keep it visible rather than silently dropping it.
      if (body) leadParts.push(`### ${section.heading}\n\n${body}`);
      continue;
    }

    // A tier.
    sawMandatedHeading = true;
    if (body) {
      tierBodies[kind] = tierBodies[kind] ? `${tierBodies[kind]}\n\n${body}` : body;
    }
  }

  const tiers: Tier[] = TIER_ORDER.filter((k) => tierBodies[k]).map((k) => ({
    key: k,
    label: TIER_LABELS[k],
    body: tierBodies[k] as string,
  }));

  if (guidance) {
    leadParts.push(`### Practical guidance\n\n${guidance}`);
  }

  const structured = sawMandatedHeading && (tiers.length > 0 || certainty !== null);

  return {
    lead: structured ? leadParts.join("\n\n").trim() : markdown,
    tiers,
    certainty,
    structured,
  };
}
