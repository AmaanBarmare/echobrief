# EchoBrief — Colour

Palette name: **Warm Dispatch**. Warm paper and warm charcoal, with a single
signal colour (ember) and one supporting accent (gold). Everything else is
semantic and used only for status.

Machine-readable: [`tokens/colors.json`](tokens/colors.json) · Drop-in CSS: [`tokens/colors.css`](tokens/colors.css)
Source of truth in the app: [`src/index.css`](../src/index.css)

---

## 1. Brand

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ember` | `#D93F0B` | `#E8430A` | Primary. Buttons, links, active nav, the logomark, the eyebrow rule. |
| `--ember-deep` | `#B83508` | `#C23508` | Pressed state — and the *only* ember safe for small body text on light. |
| `--ember-hi` | `#E84D1A` | `#FF6B35` | Hover. |
| `--ember-ink` | `#8C2F05` | `#FF8956` | Ember text sitting on an ember tint. |
| `--gold` | `#F5C842` | `#F5C842` | Secondary accent. Gradient end, action items, highlights. |
| `--gold-light` | `#FFE08A` | `#FFE08A` | Gold fills and highlight backgrounds. |

Ember shifts brighter in dark mode on purpose — `#D93F0B` muddies against warm
charcoal. Never hardcode one ember for both themes.

### The gradient

```css
/* light */ linear-gradient(135deg, #D93F0B 0%, #F5C842 100%)
/* dark  */ linear-gradient(135deg, #E8430A 0%, #F5C842 100%)
```

Reserved for: the logomark, the app icon, the primary hero CTA, and the 4px
signature bar on section headers. That's the whole list. It is not a background
treatment and never sits behind body copy.

---

## 2. Neutrals

Warm-tinted, defined in OKLCH so lightness steps stay perceptually even. Hex
given for design tools, email, and print — use OKLCH on the web.

### Light — paper & ink

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `--paper` | `#FAF4EF` | `oklch(97% 0.01 60)` | App background |
| `--paper-raised` | `#F2E9E4` | `oklch(94% 0.012 55)` | Raised surface, hover fill |
| `--paper-deep` | `#E9DFD9` | `oklch(91% 0.014 52)` | Inset, inputs |
| `--paper-card` | `#FEFBF8` | `oklch(99% 0.005 65)` | Card fill |
| `--ink` | `#190F0B` | `oklch(18% 0.02 40)` | Primary text |
| `--ink-mid` | `#514540` | `oklch(40% 0.018 42)` | Secondary text |
| `--ink-soft` | `#827873` | `oklch(58% 0.015 45)` | Muted text |
| `--ink-faint` | `#AAA39F` | `oklch(72% 0.01 50)` | Metadata, timestamps |
| `--rule` | `#E0D5CF` | `oklch(88% 0.015 50)` | Borders, dividers |
| `--rule-soft` | `#EFE6E0` | `oklch(93% 0.012 55)` | Faint dividers |

### Dark — char & bone

| Token | Hex | OKLCH | Use |
|---|---|---|---|
| `--char` | `#120C09` | `oklch(16% 0.012 40)` | App background |
| `--char-raised` | `#1E1613` | `oklch(21% 0.014 40)` | Raised surface |
| `--char-deep` | `#191210` | `oklch(19% 0.012 40)` | Inset, inputs |
| `--char-card` | `#261D1A` | `oklch(24% 0.015 40)` | Card fill |
| `--bone` | `#F1E9E3` | `oklch(94% 0.012 60)` | Primary text |
| `--bone-mid` | `#BDB6B1` | `oklch(78% 0.01 55)` | Secondary text |
| `--bone-soft` | `#8B8581` | `oklch(62% 0.01 50)` | Muted text |
| `--bone-faint` | `#635C59` | `oklch(48% 0.01 48)` | Metadata |
| `--rule-dark` | `#362B27` | `oklch(30% 0.018 42)` | Borders |
| `--rule-dark-soft` | `#2B221E` | `oklch(26% 0.015 42)` | Faint dividers |

In dark mode the light tokens are re-pointed at these, so components keep
reading `--paper` / `--ink` and switch themes for free.

---

## 3. Semantic

Status colour is never brand colour. Ember means *"this is interactive"* — the
moment it also means "recording" or "error", both meanings die.

| Token | Hex | OKLCH | Means |
|---|---|---|---|
| `--ok` | `#479C4D` | `oklch(62% 0.14 145)` | Success, completed |
| `--warn` | `#D6A20A` | `oklch(74% 0.15 85)` | Warning, processing |
| `--stop` | `#D7352D` | `oklch(58% 0.2 28)` | Error, failed, stop recording |
| `--info` | `#2B88C0` | `oklch(60% 0.12 240)` | Informational |
| `--violet` | `#8A5FC9` | `oklch(58% 0.16 300)` | AI / insights tag |

Status dot mapping used across the app: `scheduled` → ink-faint · `upcoming` →
ember · `recording` → stop (pulsing) · `processing` → warn · `completed` → ok ·
`failed` → stop.

---

## 4. Tints and elevation

```css
--ember-tint-7   /* row hover, active list row background */
--ember-tint-12  /* pill and badge fills */
--ember-tint-20  /* borders on active/hover cards */
--ember-tint-40  /* focus rings, emphasis strokes */
```

Shadows are warm, never neutral grey: `--shadow-paper-sm|md|lg` for surfaces,
`--shadow-ember|ember-lg` for the primary CTA only.

Radii: `0.375rem` small controls · `0.5rem` medium · `0.625rem` default card and
button · `999px` pills · `22%` of side for the app icon squircle.

---

## 5. Contrast — measured, not assumed

WCAG 2.1 ratios against the surfaces these colours actually sit on.

| Pair | Ratio | Verdict |
|---|---|---|
| ink on paper | 17.3 | AAA |
| ink-mid on paper | 8.5 | AAA |
| ink-soft on paper | 3.9 | Large text and UI only |
| ink-faint on paper | 2.3 | Decorative metadata only — never load-bearing |
| **ember on paper** | **4.1** | **Fails AA for body text.** Large text (≥24px, or ≥18.66px bold) and UI components only |
| ember-deep on paper | 5.4 | AA — use this for ember-coloured body copy on light |
| white on ember | 4.5 | AA, exactly. Do not lighten the button fill |
| bone on char | 16.2 | AAA |
| bone-mid on char | 9.7 | AAA |
| bone-soft on char | 5.3 | AA |
| bone-faint on char | 3.0 | Large text and UI only |
| ember (dark) on char | 4.8 | AA |
| gold on paper | 1.5 | **Never** — gold is a fill, not a text colour on light |
| gold on char | 12.2 | AAA — gold text is a dark-mode-only move |
| ink on gold | 11.9 | AAA — the correct way to use gold as a fill |

---

## 6. Rules

- One ember per view. If two things are ember, neither reads as the action.
- Never fill a large surface with ember or the gradient.
- Never place ember next to `--stop` — the two reds fight and the error loses.
- Gold never carries a primary CTA on its own.
- Never substitute ember for a status colour, especially recording.
- Never introduce a cool grey. Every neutral in this system is warm-tinted; a
  neutral grey next to it reads as a bug.
- Don't invent shades. If you need a step that isn't here, add it to
  `tokens/colors.json` and `src/index.css` together.
