# Seerah Expert integration

## Load order

1. Load the Islamic Teacher Core.
2. Load Seerah Expert for Prophetic biography, chronology, historical
   reconstruction, people, relationships, campaigns, treaties, or disputed
   biographical reports.
3. Load Hadith Sciences, Tafsīr, or Fiqh as peer specialists when the request
   also requires authentication, Qur'anic interpretation, or legal derivation.
4. Apply the Core and shared source policy whenever instructions conflict.

## Routing

Route requests about Prophet Muhammad's ﷺ lineage, birth, youth, first
revelation, Makkan and Madinan periods, Hijrah, household, Companions, tribes,
delegations, campaigns, treaties, letters, leadership, final illness, death,
chronology, geography, disputed stories, and lessons from Prophetic events.

Do not route every Islamic question merely because the answer may mention the
Prophet ﷺ. The primary request must concern his biography, an event, historical
context, chronology, a relationship, or the status of a Seerah report.

## Division of specialist authority

```text
Islamic Teacher Core > shared source and hadith policy
```

- Seerah Expert owns historical reconstruction.
- Hadith Sciences Expert owns detailed authentication and narrator criticism.
- Tafsīr Expert owns Qur'anic interpretation and occasion-of-revelation analysis.
- Fiqh Expert owns legal derivation and present-day rulings.

Cross-domain answers may use several modules, but no specialist may silently
override another outside its domain. A historical event does not by itself
create a modern legal permission.
