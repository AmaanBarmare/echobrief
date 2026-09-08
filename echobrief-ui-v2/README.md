# EchoBrief UI v2 — handoff package

Everything needed to implement the redesigned UI without access to the design canvas.

```
echobrief-ui-v2/
├── README.md                ← you are here
├── CLAUDE_PROMPT.md         ← paste this into Claude Code to start the migration
├── BRAND_DECISION.md        ← decided: mockup palette is the new brand; Phase 0 updates brand:check
├── DESIGN_SPEC.md           ← tokens, components, rules (the source of truth)
├── MIGRATION_PLAN.md        ← phased, zero-downtime rollout
├── mockups/
│   ├── desktop/*.png        ← 15 desktop screens, 1440px wide
│   ├── mobile/*.png         ← 16 mobile screens, 390px wide
│   └── html/*.html          ← the same screens as standalone HTML (open in a browser,
│                               inspect any element for exact px values / colours)
├── brands/                  ← official brand marks (copy to public/brands/)
└── ui-kit/
    ├── tokens.css           ← authoritative values; fold into colors.json / index.css / tailwind.config
    └── components/*.tsx     ← reference React components (inline-style). Rebuild as Tailwind +
                                shadcn variants in the repo; use these for props, sizes and states
```

## How to use
1. Unzip into the repo root so you have `<repo>/echobrief-ui-v2/`. (Add it to git — it's documentation.)
2. Open Claude Code in the repo and paste the contents of `CLAUDE_PROMPT.md` as the first message.
3. Claude reads `DESIGN_SPEC.md` + `MIGRATION_PLAN.md`, inspects the mockups, and starts Phase 0.

The HTML mockups are static (no JS); they load fonts from Google Fonts, so open them online.
Brand marks: `gcal`, `outlook`, `slack`, `zoho` as `.png` (+ original `.webp`). Meet/Zoom marks: `simple-icons` (`siGooglemeet`, `siZoom`). Email delivery is Resend — a `mail` icon, not a brand tile.
