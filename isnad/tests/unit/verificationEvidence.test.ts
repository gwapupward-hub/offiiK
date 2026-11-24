import assert from "node:assert/strict";
import { test } from "node:test";
import {
  normalizeEvidenceText,
  evaluateExactEvidence,
  formatVerificationResult,
  type ApprovedSource,
} from "@/lib/community/verificationEvidence";

const fixture: ApprovedSource = {
  id: "11111111-1111-4111-8111-111111111111",
  sourceType: "scholarship",
  work: "Synthetic Test Fixture",
  locator: "fixture-1",
  edition: "CI only",
  sourceVersion: "test-v1",
  sourceUrl: null,
  canonicalText: "The example wording describes a careful source check",
  normalizedText: "the example wording describes a careful source check",
  reviewStatus: "approved",
};

test("Arabic diacritics normalize but consonants and hamza remain significant", () => {
  assert.equal(normalizeEvidenceText("إِنَّ اللّٰهَ غَفُورٌ رَحِيمٌ"), "إن الله غفور رحيم");
  assert.notEqual(normalizeEvidenceText("أمل"), normalizeEvidenceText("امل"));
  assert.equal(normalizeEvidenceText("َ  "), "");
});

test("exact match returns only a text finding, not an authentication or grading", () => {
  const result = evaluateExactEvidence("THE example wording describes a careful source check.", [fixture]);
  assert.equal(result.status, "text_matched");
  assert.equal(result.matches.length, 1);
  const formatted = formatVerificationResult(result);
  assert.match(formatted, /NOT determined hadith authenticity/i);
  assert.match(formatted, /Synthetic Test Fixture/);
  assert.doesNotMatch(formatted, /ṣaḥīḥ|sahih|authentic narration/i);
});

test("pending or revoked records can never be used for verification", () => {
  for (const state of ["pending", "revoked"] as const) {
    const result = evaluateExactEvidence(fixture.canonicalText, [{ ...fixture, reviewStatus: state }]);
    assert.equal(result.status, "inconclusive");
    assert.equal(result.matches.length, 0);
  }
});

test("no corpus or paraphrase produces inconclusive, never fabricated grading", () => {
  assert.equal(evaluateExactEvidence("I heard a statement without a citation", []).status, "inconclusive");
  const result = evaluateExactEvidence("This sentence merely resembles a source", [fixture]);
  assert.equal(result.status, "inconclusive");
  assert.match(result.message, /does not establish.*false/i);
});

test("tampered normalized index and near-match must not pass", () => {
  const text = fixture.canonicalText;
  const wrongIndex = { ...fixture, normalizedText: "the wrong normalized content" };
  assert.equal(evaluateExactEvidence(text, [wrongIndex]).status, "inconclusive");
  const wrongCanonical = { ...fixture, canonicalText: "Completely unrelated source wording" };
  assert.equal(evaluateExactEvidence(text, [wrongCanonical]).status, "inconclusive");
  assert.equal(evaluateExactEvidence(text + " but not exactly", [fixture]).status, "inconclusive");
});
