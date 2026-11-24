import { getDatabase } from "@/lib/db";

/**
 * C2 evidence engine: an exact match to a reviewed source is evidence of the
 * wording only. It is NEVER proof of narration authenticity, grading, or a
 * correct interpretation. There is no model-generated verification verdict.
 */
export type VerificationStatus = "inconclusive" | "text_matched";
export type ApprovedSource = {
  id: string;
  sourceType: "quran" | "hadith" | "scholarship";
  work: string;
  locator: string;
  edition: string;
  sourceVersion: string;
  sourceUrl: string | null;
  canonicalText: string;
  normalizedText: string;
  reviewStatus: "approved" | "pending" | "revoked";
};

export type VerificationResult = {
  status: VerificationStatus;
  message: string;
  matches: Array<Pick<ApprovedSource,
    "id" | "sourceType" | "work" | "locator" | "edition" | "sourceVersion" | "sourceUrl">>;
};

/** Strict comparison, preserving the consonantal structure of Arabic text. */
export function normalizeEvidenceText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064b-\u065f\u0670\u06d6-\u06ed]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u200c-\u200f\u202a-\u202e]/g, "")
    .replace(/[.,;:!?،؛؟\u061f\u06dd\u06de"“”'‘’()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("und");
}

/** Accept only exact wording from explicit human-reviewed reference records. */
export function evaluateExactEvidence(text: string, records: readonly ApprovedSource[]): VerificationResult {
  const normalized = normalizeEvidenceText(text);
  const matches = records
    .filter((record) => record.reviewStatus === "approved" &&
      record.normalizedText === normalized &&
      normalizeEvidenceText(record.canonicalText) === normalized)
    .slice(0, 10)
    .map(({ id, sourceType, work, locator, edition, sourceVersion, sourceUrl }) => ({
      id, sourceType, work, locator, edition, sourceVersion, sourceUrl,
    }));

  if (!matches.length) {
    return {
      status: "inconclusive",
      message: "Isnad could not confirm this wording against its human-reviewed reference index. " +
        "This does not establish that the claim is false, weak, or fabricated. Please consult a qualified scholar or the original source.",
      matches: [],
    };
  }

  return {
    status: "text_matched",
    message: "The submitted wording matches a human-reviewed source record. " +
      "This is only a textual match. Isnad has NOT determined hadith authenticity, scholarly grading, attribution, or interpretation.",
    matches,
  };
}

export type VerificationInput = {
  communityId: string;
  telegramUserId: number;
  telegramMessageId: number;
  threadId: number | null;
  submissionText: string;
};

/**
 * This function is not connected to group handling until the C2 rollout gate
 * is separately approved. No sources are seeded or marked approved by C2A.
 */
export async function verifyAndStoreText(input: VerificationInput): Promise<{
  requestId: string;
  result: VerificationResult;
}> {
  const original = input.submissionText.trim();
  if (original.length < 10 || original.length > 2500) {
    throw new Error("Verification text must be between 10 and 2500 characters.");
  }
  const normalized = normalizeEvidenceText(original);
  if (normalized.length < 10) {
    throw new Error("Verification text is too short to match reliably.");
  }

  const sql = getDatabase();
  return sql.begin(async (tx) => {
    const sources = await tx.unsafe<Array<{
      id: string; source_type: ApprovedSource["sourceType"]; work: string;
      locator: string; edition: string; source_version: string;
      source_url: string | null; canonical_text: string; normalized_text: string;
      review_status: "approved";
    }>>(
      "SELECT id::text AS id, source_type, work, locator, edition, source_version, " +
      "source_url, canonical_text, normalized_text, review_status " +
      "FROM source_records WHERE review_status = 'approved' AND community_id = $2 AND normalized_text = $1 LIMIT 11",
      [normalized, input.communityId]
    );
    const records: ApprovedSource[] = sources.map((row) => ({
      id: row.id,
      sourceType: row.source_type,
      work: row.work,
      locator: row.locator,
      edition: row.edition,
      sourceVersion: row.source_version,
      sourceUrl: row.source_url,
      canonicalText: row.canonical_text,
      normalizedText: row.normalized_text,
      reviewStatus: row.review_status,
    }));
    const result = evaluateExactEvidence(original, records);
    const [request] = await tx.unsafe<Array<{ id: string }>>(
      "INSERT INTO verification_requests " +
      "(community_id, requester_telegram_user_id, telegram_message_id, thread_id, submission_text, status, processed_at) " +
      "VALUES ($1, $2, $3, $4, $5, $6, now()) RETURNING id::text AS id",
      [input.communityId, input.telegramUserId, input.telegramMessageId,
        input.threadId, original, result.status]
    );
    for (const match of result.matches) {
      await tx.unsafe(
        "INSERT INTO verification_findings " +
        "(request_id, source_record_id, text_match_status, outcome_note) " +
        "VALUES ($1, $2, 'exact', $3)",
        [request.id, match.id, "Text matched. No attribution or grading assessment performed."]
      );
    }
    return { requestId: request.id, result };
  });
}

/** Chat-safe summary, with no unsupported claim of hadith authentication. */
export function formatVerificationResult(result: VerificationResult): string {
  const references = result.matches
    .map((record) => {
      const where = record.work + " — " + record.locator + " (" + record.edition + ")";
      return record.sourceUrl ? where + "\n" + record.sourceUrl : where;
    })
    .join("\n\n");
  const heading = result.status === "text_matched" ? "Text match located" : "Verification inconclusive";
  return "Isnad Content Verification — " + heading + "\n\n" +
    result.message + (references ? "\n\nReviewed source records:\n" + references : "");
}
