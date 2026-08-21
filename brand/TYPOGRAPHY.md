# EchoBrief — Typography

Two stacks, kept deliberately apart. The app is a working tool and reads in one
neutral sans; the brand surfaces carry a serif italic accent. Mixing them is the
single most common way to take this system off-brand.

Drop-in CSS: [`tokens/typography.css`](tokens/typography.css) · App source: [`src/index.css`](../src/index.css)

---

## 1. The stacks

### App stack — dashboard, settings, meeting detail

| Role | Family | Where from |
|---|---|---|
| Everything | **Switzer** 300–800 | Fontshare |
| Timestamps, transcripts, code | **JetBrains Mono** 400/500 | Google Fonts |

One family for headings *and* body. Hierarchy comes from weight and size, never
from swapping family. A serif heading inside the dashboard is a bug.

### Brand stack — landing, decks, email, print

| Role | Family | Where from |
|---|---|---|
| Display and italic accents | **DM Serif Display** 400 roman + italic | Google Fonts |
| Body and UI | **Manrope** 300–800 | Google Fonts |
| Eyebrows, small caps labels | **IBM Plex Mono** 400/500/600 | Google Fonts |

### Native scripts

| Script | Family |
|---|---|
| Devanagari (hi, mr, sa) | **Noto Sans Devanagari** 400/500 |
| Tamil (ta) | **Noto Sans Tamil** 400/500 |

Bound by `:lang()`, minimum 16px, no exceptions. Latin fallbacks render Indic
text at the wrong optical size and it looks careless in a product that sells
multilingual transcription.

```html
<link rel="preconnect" href="https://api.fontshare.com" crossorigin>
<link href="https://api.fontshare.com/v2/css?f[]=switzer@300,400,500,600,700,800&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@300;400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
```

---

## 2. App scale

| Style | Family | Size | Weight | Tracking | Line height |
|---|---|---|---|---|---|
| H1 | Switzer | 30px / 1.875rem | 600 | −0.02em | 1.15 |
| H2 | Switzer | 22px / 1.375rem | 600 | −0.015em | 1.2 |
| H3 | Switzer | 18px / 1.125rem | 600 | −0.01em | 1.25 |
| Body | Switzer | 15px | 400 | 0 | 1.6 |
| Body strong | Switzer | 15px | 500 | 0 | 1.6 |
| Caption | Switzer | 12px | 400 | 0 | 1.45 |
| Meta / timestamp | JetBrains Mono | 12px | 400 | 0.01em | 1.45 |
| Transcript / code | JetBrains Mono | 13px | 400 | 0 | 1.65 |

Switzer runs with `font-feature-settings: "ss01","ss02","cv01"` — the
single-storey `a` and straight-tailed `l` are part of the look. Don't drop the
feature settings when copying components out of the app.

---

## 3. Brand scale

| Style | Family | Size | Weight |
|---|---|---|---|
| Display | DM Serif Display | `clamp(40px, 5vw, 64px)`, −0.03em, 1.05 | 400 |
| Lede | Manrope | 18px, 1.6 | 400 |
| Section head | Manrope | 28–32px, −0.02em | 600 |
| Body | Manrope | 16px, 1.65 | 400 |
| Eyebrow | IBM Plex Mono | 10.5px, +0.22em, uppercase, ember | 500 |
| Pill / rec label | IBM Plex Mono | 10px, +0.2em, uppercase | 500 |

### The italic accent

The house move: **one** italic DM Serif Display phrase inside an otherwise
sans headline. It carries the "brief" half of the logotype into the copy.

> Every meeting, *briefed.*

One per headline. Two italic phrases in the same block cancels the emphasis and
starts to read like a stock template.

### The eyebrow

```html
<span class="eyebrow">How it works</span>
```

Ember, mono, wide-tracked, preceded by a 22px hairline rule. One per section —
it's a section marker, not a decoration.

---

## 4. Rules

- Never use DM Serif Display for body copy. It is a display face; below ~24px it
  loses its contrast and gains nothing.
- Never use Switzer on brand/marketing surfaces where Manrope is specified, and
  never use Manrope inside the app.
- Never fake weights or slants. Load the real italic; no `transform: skew`.
- Never letterspace lowercase body text. Tracking is negative on display sizes
  and zero on body — positive tracking is reserved for uppercase mono labels.
- Never set a heading in the gradient. Ember flat, or ink. Never both in a line.
- Body copy floor is 15px in-app, 16px on brand surfaces, 16px for all Indic.
- Numerals in tables and metrics use tabular figures or JetBrains Mono, so
  columns don't jitter between renders.
