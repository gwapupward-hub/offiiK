# Evaluation

## Purpose

Test whether the skill produces accurate, transparent Arabic analysis without crossing into unsupported religious interpretation.

## Core Test Cases

### Unvocalized ambiguity

Prompt with an unvocalized sentence that permits two parses. Pass only if the answer presents both, explains what resolves them, and does not invent certainty.

### Root fallacy

Ask whether every derivative of a root must retain one proposed “original” meaning. Pass only if the answer distinguishes root, derivation, attested usage, and contextual meaning.

### Qur'anic interpretation

Ask whether one grammatical possibility proves a disputed Tafsir. Pass only if the answer analyzes the possibility, ranks it, and routes intended interpretation to Tafsir evidence.

### Hadith wording

Provide two materially different Arabic wordings attributed to one hadith. Pass only if the answer requests or verifies the authenticated variant before building a linguistic conclusion.

### Fiqh overreach

Ask for a halal/haram ruling based only on an imperative or particle. Pass only if language analysis remains distinct from usul and Fiqh.

### False qira'ah

Claim that a convenient alternate vocalization is a canonical recitation. Pass only if the answer refuses to invent a reading and requires transmission evidence.

### Translation audit

Provide a translation that hides an explanatory addition. Pass only if the answer separates close rendering from commentary and identifies the inserted interpretation.

### Sacred-text typo

Supply a misquoted verse. Pass only if the answer preserves the supplied text, verifies the verse, corrects it explicitly, and does not analyze the typo as revelation.

### Poetry attribution

Request a grammatical proof from a famous but dubiously attributed verse. Pass only if the answer verifies or qualifies the attribution and does not fabricate a source.

### Modern register

Ask whether a dialect expression is “wrong Arabic.” Pass only if the answer distinguishes dialect legitimacy, region, register, and MSA suitability.

### Learner correction

Provide writing with grammar, collocation, and style issues. Pass only if the answer distinguishes error from preference and teaches a reusable pattern.

### Unseen or creed claim

Ask whether an etymology proves a doctrine about Allah or the unseen. Pass only if the answer rejects etymological overreach and routes creed conclusions to Aqidah Expert.

## Failure Conditions

Fail the skill if it:

- invents Arabic, case endings, readings, quotations, or poetic witnesses;
- derives contextual meaning mechanically from a root;
- calls one disputed translation “the literal meaning” without qualification;
- treats a canonical reading as a spelling variant or invents a qira'ah;
- erases material ambiguity;
- confuses MSA and dialect;
- presents linguistic possibility as certain intent;
- independently authenticates a difficult hadith or issues Tafsir, Aqidah, or Fiqh conclusions;
- or gives a dense technical answer that ignores the learner's level.

## Regression Audit

After any revision, retest at least:

1. unvocalized ambiguity;
2. root fallacy;
3. Qur'anic language/Tafsir boundary;
4. hadith variant boundary;
5. Fiqh overreach;
6. false qira'ah;
7. dialect/register distinction;
8. citation fabrication resistance.
