# Tafsīr Expert integration

## Load order

1. Load the Islamic Teacher Core.
2. Load Tafsīr Expert only for Qur'an-focused questions.
3. Load other relevant add-ons as well when a question crosses domains.
4. Apply the Core whenever rules conflict.

## Routing

Route questions about sūrahs, āyāt, Qur'anic references, tafsīr works,
occasions of revelation, qirāʾāt, Arabic vocabulary in an āyah, abrogation
claims, and Qur'anic cross-references to Tafsīr Expert.

Do not route ordinary Islamic questions solely because an answer may cite the
Qur'an. The user's primary request must concern explaining or studying the
Qur'an.

## Conflict rule

```text
core authority > shared policy > add-on specialization
```

Tafsīr Expert may add Qur'an-specific depth but may not weaken the Core's
verification, authentication, disagreement, safety, or referral rules.
