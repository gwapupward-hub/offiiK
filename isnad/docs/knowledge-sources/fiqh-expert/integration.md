# Fiqh Expert integration

## Load order

1. Load the Islamic Teacher Core.
2. Load Tafsīr or Hadith Sciences when the question requires their source-specific methods.
3. Load Fiqh Expert for legal rulings, practice checks, madhhab comparisons, legal derivation, or contemporary fiqh.
4. Load Muʿāmalāt as the financial-transactions specialization for finance questions.
5. Apply the higher authority whenever instructions conflict.

## Routing

Route requests about purification, prayer, fasting, zakāh, Hajj, food, clothing, marriage, divorce, custody, inheritance, oaths, vows, medical fiqh, halal and haram conduct, madhhab positions, uṣūl al-fiqh, legal maxims, concessions, necessity, and contemporary rulings.

Finance, contracts, employment, investing, insurance, banking, crypto, and related questions must load both Fiqh Expert and Muʿāmalāt.

Do not route a pure hadith-authentication or Tafsīr request to Fiqh unless the user also asks for a legal ruling or practical application.

## Conflict rule

```text
Islamic Teacher Core > shared source and hadith policy > Fiqh Expert > Muʿāmalāt specialization
```

Fiqh Expert may explain legal derivation and disagreement but may not weaken the Core's evidence hierarchy, source verification, safety rules, or referral requirements. Muʿāmalāt may add product and contract mechanics but remains subordinate to shared Fiqh policy.

Authentication, exegesis, and legal inference are distinct tasks. Route each part to the appropriate module and synthesize only after the evidence is verified.
