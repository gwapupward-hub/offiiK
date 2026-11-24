import { getDatabase } from "@/lib/db";
import { recordAuditEvent } from "@/lib/community/communityAudit";
import { normalizeEvidenceText } from "@/lib/community/verificationEvidence";

export type DraftSource = {
  sourceType: "quran" | "hadith" | "scholarship";
  work: string; locator: string; edition: string; canonicalText: string;
  language: "ar" | "en"; sourceVersion: string; sourceUrl: string | null;
  licenseNotice: string;
  provenance: { provider: string; citation: string; rightsBasis: string };
};
export type ReviewDecision = "approve" | "revoke";
export type ReviewResult =
  | { kind: "approved"; id: string }
  | { kind: "revoked"; id: string }
  | { kind: "not_found" }
  | { kind: "conflict" }
  | { kind: "self_review" };

const FIELDS = new Set(["sourceType","work","locator","edition","canonicalText","language","sourceVersion","sourceUrl","licenseNotice","provenance"]);
const SOURCE_TYPES = new Set(["quran","hadith","scholarship"]);
function bounded(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.trim().length <= max;
}

/** Curator-supplied, rights-attributed text only; no autonomous source ingestion. */
export function parseDraftSource(body: Record<string, unknown>): { ok: true; value: DraftSource } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  for (const key of Object.keys(body)) if (!FIELDS.has(key)) issues.push("Unsupported field: " + key);
  for (const field of ["work","locator","edition","sourceVersion"]) {
    if (!bounded(body[field],1,180)) issues.push(field + " must be 1-180 characters.");
  }
  if (!bounded(body.canonicalText,10,2500)) issues.push("canonicalText must be 10-2500 characters.");
  if (!SOURCE_TYPES.has(body.sourceType as string)) issues.push("Invalid sourceType.");
  if (body.language !== "ar" && body.language !== "en") issues.push("Invalid language.");
  if (body.sourceUrl != null &&
    (typeof body.sourceUrl !== "string" || !/^https:\/\/[^/\s?#]+(?:[/?#][^\s]*)?$/.test(body.sourceUrl) || body.sourceUrl.length > 1200)) {
    issues.push("sourceUrl must be HTTPS or null.");
  }
  if (!bounded(body.licenseNotice,8,600)) issues.push("licenseNotice must declare rights.");
  const p = body.provenance;
  if (!p || typeof p !== "object" || Array.isArray(p)) issues.push("provenance object required.");
  else {
    const data = p as Record<string, unknown>;
    if (Object.keys(data).some(k=>!["provider","citation","rightsBasis"].includes(k))) issues.push("Unknown provenance field.");
    for (const k of ["provider","citation","rightsBasis"]) if (!bounded(data[k],3,300)) issues.push("Missing provenance " + k);
  }
  if (bounded(body.canonicalText,10,2500) && normalizeEvidenceText(body.canonicalText).length < 10) {
    issues.push("canonicalText has insufficient normalized length.");
  }
  if (issues.length) return { ok:false, issues };
  return { ok:true, value: {
    sourceType: body.sourceType as DraftSource["sourceType"],
    work:(body.work as string).trim(), locator:(body.locator as string).trim(),
    edition:(body.edition as string).trim(), canonicalText:(body.canonicalText as string).trim(),
    language:body.language as DraftSource["language"], sourceVersion:(body.sourceVersion as string).trim(),
    sourceUrl:(body.sourceUrl as string|null|undefined) ?? null,
    licenseNotice:(body.licenseNotice as string).trim(),
    provenance:body.provenance as DraftSource["provenance"],
  }};
}

export async function submitSourceDraft(input: {
  communityId:string; actorUserId:string; actorTelegramUserId:number;
  correlationId:string; draft:DraftSource;
}): Promise<string> {
  const sql=getDatabase();
  return sql.begin(async tx => {
    const d=input.draft;
    const rows=await tx.unsafe<Array<{id:string}>>(
      "INSERT INTO source_records (community_id, submitted_by, source_type, work, locator, edition,"+
      "canonical_text, normalized_text, language, source_version, source_url, license_notice, provenance) "+
      "VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb) RETURNING id::text AS id",
      [input.communityId,input.actorUserId,d.sourceType,d.work,d.locator,d.edition,d.canonicalText,
        normalizeEvidenceText(d.canonicalText),d.language,d.sourceVersion,d.sourceUrl,d.licenseNotice,JSON.stringify(d.provenance)]
    );
    const id=rows[0].id;
    await recordAuditEvent(tx, {communityId:input.communityId,actorUserId:input.actorUserId,
      actorTelegramUserId:input.actorTelegramUserId,action:"source.submitted",entityType:"source_record",entityId:id,
      after:{state:"pending",sourceType:d.sourceType,work:d.work,locator:d.locator},correlationId:input.correlationId});
    return id;
  });
}

/** Reviewer cannot approve their own draft; transitions are row-locked and audited. */
export async function reviewSourceRecord(input: {
  communityId:string; sourceId:string; actorUserId:string; actorTelegramUserId:number;
  correlationId:string; decision:ReviewDecision;
}): Promise<ReviewResult> {
  const sql=getDatabase();
  return sql.begin(async (tx):Promise<ReviewResult> => {
    const rows=await tx.unsafe<Array<{id:string;review_status:"pending"|"approved"|"revoked";submitted_by:string|null;work:string;locator:string}>>(
      "SELECT id::text AS id, review_status, submitted_by::text AS submitted_by, work, locator "+
      "FROM source_records WHERE id = $1 AND community_id = $2 FOR UPDATE",[input.sourceId,input.communityId]
    );
    const source=rows[0];
    if(!source)return {kind:"not_found"};
    if(source.submitted_by===input.actorUserId)return {kind:"self_review"};
    if((input.decision==="approve"&&source.review_status!=="pending")||
       (input.decision==="revoke"&&source.review_status!=="approved"))return {kind:"conflict"};
    const next=input.decision==="approve"?"approved":"revoked";
    await tx.unsafe("UPDATE source_records SET review_status=$1, reviewed_by=$2, reviewed_at=now() "+
      "WHERE id=$3 AND community_id=$4",[next,input.actorUserId,input.sourceId,input.communityId]);
    await recordAuditEvent(tx,{communityId:input.communityId,actorUserId:input.actorUserId,
      actorTelegramUserId:input.actorTelegramUserId,action:"source."+next,entityType:"source_record",
      entityId:source.id,before:{state:source.review_status},
      after:{state:next,work:source.work,locator:source.locator},correlationId:input.correlationId});
    return {kind:next,id:source.id};
  });
}

export async function listCommunitySources(communityId:string, limit=30):Promise<unknown[]>{
  const sql=getDatabase();
  const rows=await sql.unsafe<Array<Record<string,unknown>>>(
    "SELECT id::text,source_type,work,locator,edition,source_version,canonical_text,language,"+
    "source_url,license_notice,provenance,review_status,created_at,reviewed_at "+
    "FROM source_records WHERE community_id=$1 ORDER BY created_at DESC LIMIT $2",
    [communityId,Math.max(1,Math.min(Math.trunc(limit),50))]
  );
  return rows.map(r=>({id:r.id,sourceType:r.source_type,work:r.work,locator:r.locator,
    edition:r.edition,sourceVersion:r.source_version,canonicalText:r.canonical_text,
    language:r.language,sourceUrl:r.source_url,licenseNotice:r.license_notice,
    provenance:r.provenance,reviewStatus:r.review_status,createdAt:r.created_at,reviewedAt:r.reviewed_at}));
}
