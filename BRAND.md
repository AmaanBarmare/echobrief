# EchoBrief Brand — Warm Dispatch

Quick reference. The full kit — designed PDF, logo files, token files, and the
long-form docs — lives in [`brand/`](brand/README.md).

> **Note:** this file previously documented an older palette (Tailwind orange
> `#F97316`, Outfit + DM Sans). That system is gone. Ember `#D93F0B` and the
> Switzer / DM Serif Display stacks below are what the app actually ships.

## Colours

| | Light | Dark |
|---|---|---|
| Primary — **Ember** | `#D93F0B` | `#E8430A` |
| Ember hover / pressed | `#E84D1A` / `#B83508` | `#FF6B35` / `#C23508` |
| Accent — **Gold** | `#F5C842` | `#F5C842` |
| Background | Paper `#FAF4EF` | Char `#120C09` |
| Card | `#FEFBF8` | `#261D1A` |
| Text | Ink `#190F0B` | Bone `#F1E9E3` |
| Border | `#E0D5CF` | `#362B27` |

Status is never brand: success `#479C4D` · processing `#D6A20A` · error and
recording `#D7352D` · info `#2B88C0` · AI/insights `#8A5FC9`.

Gradient — logomark, app icon, hero CTA, and the 4px section bar only:
`linear-gradient(135deg, #D93F0B, #F5C842)`.

Ember on paper is 4.1:1 — large text and UI only. For ember-coloured body copy
use `--ember-deep` (`#B83508`, 5.4:1). Gold on light is 1.5:1: fill, never text.

Full palette, tints, shadows, contrast table → [`brand/COLORS.md`](brand/COLORS.md)
Tokens → [`brand/tokens/colors.json`](brand/tokens/colors.json) · [`colors.css`](brand/tokens/colors.css)

## Typography

- **App** (dashboard, settings, meeting detail): Switzer for headings *and* body;
  JetBrains Mono for timestamps and transcripts.
- **Brand** (landing, decks, email, print): DM Serif Display for display and
  italic accents, Manrope for body, IBM Plex Mono for eyebrows.
- **Indic**: Noto Sans Devanagari / Noto Sans Tamil, 16px minimum, bound by `:lang()`.

Hierarchy comes from weight and size, never from swapping family. House move:
one italic serif phrase per headline — *briefed*, not BRIEFED.

Scales and rules → [`brand/TYPOGRAPHY.md`](brand/TYPOGRAPHY.md) · [`typography.css`](brand/tokens/typography.css)

## Logo

Three concentric ripples (28% / 52% / solid core) in the ember→gold gradient.
Wordmark: `echo` roman in ink, *`brief`* italic in ember, DM Serif Display,
tracking −0.04em.

Clear space = core diameter on all sides. Minimum 120px full lockup, 24px mark
alone; below that use the app icon. In-app, render
[`src/components/ui/Logo.tsx`](src/components/ui/Logo.tsx) so it inherits the
theme; everywhere else use the files in [`brand/logo/`](brand/logo).

Construction and don'ts → [`brand/LOGO.md`](brand/LOGO.md)

## Interface signatures

Eyebrow (ember mono, +0.22em, hairline rule, one per section) · recording pill ·
12-bar waveform · 8px status dots · 4px gradient bar. Icons are Lucide React at
`strokeWidth={1.75}`. Cards: `0.625rem` radius, 1px rule border, warm shadow.
Motion: UI 150–200ms, brand loops 1.2–2.8s, always with a reduced-motion fallback.

## Voice

Conversational, not corporate. Outcome first. Confident without superlatives.
India-aware — name the languages, price in ₹.

Never write "AI-powered", "cutting-edge", "next-gen", "revolutionary",
"seamless", "unlock". No exclamation marks.

## Ten rules

1. One ember per view.
2. Ember never means a status — recording is `--stop`, not ember.
3. No cool greys. Every neutral here is warm-tinted.
4. Gradient only on: logomark, app icon, hero CTA, 4px section bar.
5. Gold is a fill, not a text colour on light.
6. No serif inside the app; no Manrope outside brand surfaces.
7. One italic phrase per headline, one eyebrow per section.
8. Never rebuild the wordmark — use `brand/logo/`.
9. Every motion has a reduced-motion fallback.
10. New token? Add it to `src/index.css` **and** `brand/tokens/colors.json` —
    never hardcode a one-off hex.
