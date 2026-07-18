# Integration Guide

## Dependency

Place this folder beside the Islamic Teacher Core:

```text
islamic-knowledge-system/
├── core/
│   └── skill.md
└── plugins/
    └── muamalat-expert/
        ├── skill.md
        ├── manifest.json
        ├── source-policy.md
        ├── evaluation.md
        └── integration.md
```

## Load order

1. Load `core/skill.md`.
2. Load `plugins/muamalat-expert/skill.md`.
3. Apply the Core whenever rules conflict.
4. Use the add-on only for finance, business, wealth, contracts, zakāh, inheritance, and modern commercial questions.

## Routing rules

Route to Muʿāmalāt Expert when a user asks about:

- halal or haram income,
- ribā,
- debt,
- loans,
- banking,
- credit cards,
- mortgages,
- business models,
- contracts,
- investing,
- stocks,
- crypto,
- staking,
- zakāh,
- inheritance,
- taxes,
- insurance,
- charity,
- or financial misconduct.

## Conflict rule

```text
core authority > shared policy > add-on specialization
```

The plug-in may add detail but may not weaken the Core’s verification or safety requirements.
