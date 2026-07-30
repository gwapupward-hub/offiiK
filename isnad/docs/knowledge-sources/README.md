# Knowledge sources

This folder holds the original skill specifications the app's live knowledge
base was built from. They're kept here for provenance and future editing —
the app itself does **not** read from this folder at runtime.

- `islamic-teacher-core.md` — the full Islamic Teacher Core skill spec.
  The app's runtime version is `../../knowledge/core.md` (a condensed
  restatement of the same rules, kept shorter for prompt efficiency).
- `muamalat-expert/` — the full Muʿāmalāt Expert (Islamic finance) add-on
  plugin, including its `manifest.json`, `integration.md` (dependency and
  load-order rules), `source-policy.md` (contemporary-finance sourcing
  rules), and `evaluation.md` (a red-team test suite for the add-on). The
  app's runtime version is `../../knowledge/muamalat.md`, which combines
  `skill.md` + `source-policy.md` + `integration.md`.
- `tafsir-expert/` — the full Tafsīr Expert add-on with its manifest and
  integration rules. The app's runtime version is
  `../../knowledge/tafsir.md`.
- `hadith-sciences-expert/` — the Hadith Sciences Expert add-on, including its
  source policy, terminology, research workflow, response standards, and
  evaluation suite. The app's bundled runtime version is
  `../../knowledge/hadith.md`.
- `fiqh-expert/` — the full Fiqh Expert add-on with uṣūl al-fiqh, legal maxims,
  domain workflows, madhhab-comparison rules, response standards, evaluation,
  and integrated Muʿāmalāt specialization. The app's shared runtime version is
  `../../knowledge/fiqh.md`; finance additionally loads
  `../../knowledge/muamalat.md`.
- `seerah-expert/` — the full Seerah Expert add-on with source criticism,
  chronology, life-period, campaign, treaty, response, and evaluation
  references. The app's bundled runtime version is
  `../../knowledge/seerah.md`.
- `aqidah-expert/` — the full ʿAqīdah Expert add-on with foundations of faith,
  names and attributes, revelation and unseen matters, qadar and theodicy,
  theological disagreement, takfīr boundaries, response standards, and
  evaluation references. The app's bundled runtime version is
  `../../knowledge/aqidah.md`.

If you want to change how the assistant answers, edit the runtime files in
`/knowledge` directly (see the root `README.md`). Update these source files
too if the change should be reflected in the canonical spec.
