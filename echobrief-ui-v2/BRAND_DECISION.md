# Brand decision — required before Phase 0

The repo enforces the **Warm Dispatch** brand system (`brand/tokens/colors.json`, `src/index.css`, `npm run brand:check` on every build and commit). The mockups in this package were drawn with a different palette and type:

| | Mockups (this package) | Repo brand system (Warm Dispatch) |
|---|---|---|
| Heading font | Outfit | DM Serif Display / Switzer |
| Body font | DM Sans | Manrope / Switzer |
| Accent | terracotta #C2410C (hover #9A3412, top #D0521E) | ember `--ember` #D93F0B, plus `--gold` |
| Secondary text | #78716C / #A8A29E | retired — must not return |
| Live/recording dot | #22C55E | retired — must not return |

Outfit and DM Sans are in `BANNED_FONTS`; the three greys/green above are in `RETIRED`. As shipped, the kit fails `brand:check` and every commit would be blocked.

## Option A — remap onto Warm Dispatch (recommended)
Keep everything structural from `DESIGN_SPEC.md` (frame, sidebar groups, pill controls, dark-active chips, 14px cards, one card level, page header, mobile tab bar) and swap only the values:
- `--eb-accent` → `--ember`; `--eb-accent-top` → a 6% lighter ember; `--eb-accent-soft` / `--eb-accent-text` → the ember tint pair already in colors.json (or derive: 8% ember on white / ember darkened 25%).
- `--eb-accent-sidebar` (#F4A574) → the lightest ember tint that reads on #1F1B18; `--gold` can take the "highlighted number" and the sidebar usage bar.
- Secondary / muted text → the repo's existing secondary and muted ink tokens.
- Recording dot → the repo's success/live token.
- Outfit → DM Serif Display for H1 and stat numbers (the serif actually suits the "console" direction well); Switzer/Manrope for everything else including card titles at 600.
Cost: half a day. The mockups become "structurally exact, colour-approximate" references. Nothing in the plan changes.

## Option B — ratify the new palette
Add the terracotta set, Outfit and DM Sans to `colors.json` / `src/index.css`, remove them from BANNED/RETIRED, and accept that the product's brand moves from ember to terracotta. This is a rebrand decision, not a UI decision: landing page, emails, Slack messages, social assets and the brand guidelines PDF all currently use ember.
Cost: a day for the token work, plus whatever it takes to bring the marketing surfaces along.

## What does not change under either option
Layout, spacing, radii, shadows, component anatomy, icon set (Lucide), page inventory, the migration phases and guardrails.

Record the choice here once made:

**Decision: Option B — ratify the new palette.** · **Date:** 8 Sep 2026 · **By:** Khush Mutha (founder)

The mockups in this package are the target, exactly as drawn. The brand system is updated to match them, not the other way round.

### What this means for Phase 0
1. `brand/tokens/colors.json`: add the full token set from `ui-kit/tokens.css` (surfaces, text, accent, semantic, avatar pairs, speaker colours). Make terracotta `#C2410C` the primary accent (`--ember` now resolves to it, or rename to `--accent` and update usages).
2. `src/index.css` / `tailwind.config`: expose the same tokens; register Outfit, DM Sans, Instrument Serif, JetBrains Mono.
3. `brand-check.mjs`: remove Outfit and DM Sans from `BANNED_FONTS`; remove `#78716C`, `#A8A29E`, `#22C55E` from `RETIRED`; add the new hexes to the allowed set. Do **not** disable the checker or skip the pre-commit hook — update its data so it keeps enforcing the *new* brand.
4. Keep the previous Warm Dispatch tokens in `colors.json` under a `legacy` key until the last V1 page is deleted, so V1 keeps passing the checker during the migration.
5. Marketing surfaces (landing page, Resend email templates, Slack Block Kit, social assets, brand PDF) are **out of scope** for this migration and will follow separately — note them in the PR description so nobody thinks they were forgotten.
