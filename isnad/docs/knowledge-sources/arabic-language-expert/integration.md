# Arabic Language Expert integration

## Load order

1. Load the Islamic Teacher Core.
2. Load Arabic Language Expert for Arabic translation, grammar, morphology,
   syntax, semantics, lexicography, rhetoric, vocalization, transliteration,
   register, dialect, learner correction, or text verification.
3. Load Tafsīr, Hadith Sciences, ʿAqīdah, Fiqh, or Seerah as peer specialists
   when the request also requires interpretation, authentication, doctrine,
   legal derivation, or historical reconstruction.
4. Apply the Core and shared source policy whenever instructions conflict.

## Routing

Route requests that explicitly ask about Qur'anic, Classical, Modern Standard,
or dialectal Arabic; translation to or from Arabic; naḥw, iʿrāb, ṣarf, roots,
patterns, conjugation, case, mood, vocabulary, semantic range, lexicons,
balāghah, rhetoric, diacritization, transliteration, pronunciation, spelling,
quotation verification, OCR repair, Arabic poetry or prose, learner correction,
or whether an Islamic interpretation depends on Arabic wording.

Do not route every Islamic question merely because it contains a familiar
Arabic religious term. The primary request must concern language, wording,
translation, textual form, or a linguistic argument.

## Division of specialist authority

```text
Islamic Teacher Core > shared source policy
```

- Arabic Language Expert owns linguistic analysis.
- Tafsīr Expert owns intended Qur'anic interpretation and revelation context.
- Hadith Sciences Expert owns authentication and establishes the wording to
  analyze.
- ʿAqīdah Expert owns doctrinal conclusions.
- Fiqh Expert owns legal derivation and applied rulings.
- Seerah Expert owns historical reconstruction.

Cross-domain answers may use several modules, but grammatical possibility must
never be presented as certain authorial intent or as a binding religious ruling.
