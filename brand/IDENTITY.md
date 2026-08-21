# EchoBrief — Brand Identity

**System name:** Warm Dispatch
**Version:** 1.0.0 · 21 August 2026
**Canonical implementation:** [`src/index.css`](../src/index.css) and [`src/components/ui/Logo.tsx`](../src/components/ui/Logo.tsx)

This document is the whole identity in one place. The three companion files go
deeper on their subject: [COLORS.md](COLORS.md), [TYPOGRAPHY.md](TYPOGRAPHY.md),
[LOGO.md](LOGO.md).

---

## 1. What EchoBrief is

EchoBrief sends a bot into your meeting, records it, transcribes it in any
language it hears, and returns English notes you can act on — summary,
decisions, action items, risks, and the numbers behind how the conversation
actually went.

The product is a working instrument, not a showpiece. The identity follows:
warm, plain, and quiet enough that the meeting content is the loudest thing on
screen.

## 2. The idea behind the look

**Warm dispatch.** A dispatch is a report filed from where the work happened —
brief, factual, sent onward. Everything in the system serves that:

- **Warm paper and warm charcoal, never neutral grey.** Meetings are human. A
  cool grey product reads like a database console.
- **One signal colour.** Ember marks what is interactive or live. If ember is
  everywhere, it means nothing.
- **Sound as the only metaphor.** Rings, ripples, waveform bars. Nothing else —
  no brains, no sparkles, no robots.
- **Restraint over decoration.** One eyebrow per section, one italic phrase per
  headline, one primary action per view.

---

## 3. Colour at a glance

| | Light | Dark |
|---|---|---|
| Primary — **Ember** | `#D93F0B` | `#E8430A` |
| Accent — **Gold** | `#F5C842` | `#F5C842` |
| Background | Paper `#FAF4EF` | Char `#120C09` |
| Card | `#FEFBF8` | `#261D1A` |
| Text | Ink `#190F0B` | Bone `#F1E9E3` |
| Border | `#E0D5CF` | `#362B27` |

Status is never brand: success `#479C4D` · processing `#D6A20A` · error and
recording `#D7352D` · info `#2B88C0` · AI/insights `#8A5FC9`.

Signature gradient — logomark, app icon, hero CTA, and the 4px section bar only:

```css
linear-gradient(135deg, #D93F0B 0%, #F5C842 100%)
```

Two contrast facts worth memorising: ember on paper is **4.1:1**, so it is a
large-text and UI colour, not a body-copy colour — use `--ember-deep` (`#B83508`,
5.4:1) for that. And gold on light is **1.5:1** — gold is a fill, never text.

Full palette, tints, shadows, and every measured contrast pair: [COLORS.md](COLORS.md).

---

## 4. Type at a glance

**App:** Switzer for everything, JetBrains Mono for timestamps and transcripts.
**Brand:** DM Serif Display for display and italic accents, Manrope for body,
IBM Plex Mono for eyebrows.
**Indic:** Noto Sans Devanagari / Noto Sans Tamil, minimum 16px, bound by `:lang()`.

Hierarchy comes from weight and size, not from swapping family. The house move
is one italic serif phrase inside an otherwise sans headline — *briefed*, not
BRIEFED.

Full scale and rules: [TYPOGRAPHY.md](TYPOGRAPHY.md).

---

## 5. Logo at a glance

Three concentric rings — outer ripple at 28%, inner at 52%, solid core —
filled with the ember→gold gradient. Wordmark is DM Serif Display: `echo` roman
in ink, *`brief`* italic in ember.

Clear space equals the core's diameter on all sides. Minimum 120px for the full
lockup, 24px for the mark alone; below that use the app icon instead.

All files and every don't: [LOGO.md](LOGO.md) · [`logo/`](logo).

---

## 6. Interface signatures

These five details are what make a screen recognisably EchoBrief.

**The eyebrow.** Ember, IBM Plex Mono, 10.5px, +0.22em, uppercase, preceded by a
22px hairline rule. One per section.

**The recording pill.** Uppercase mono label in an ember tint with a 25% ember
border, pill radius, and a 7px ember dot blinking at 1.2s. Disabled under
`prefers-reduced-motion`.

**The waveform.** Twelve 3px ember bars at staggered heights and durations,
28px tall. Used for live audio state, never as background art.

**Status dots.** 8px. `scheduled` ink-faint · `upcoming` ember · `recording`
stop, pulsing · `processing` warn · `completed` ok · `failed` stop. Ember is
never the recording colour.

**The gradient bar.** A 4px ember→gold rule above a section header or card.
The only place the gradient touches a layout.

### Buttons

| | Fill | Text | Radius | Weight |
|---|---|---|---|---|
| Primary | Ember (gradient for the hero CTA only) | White | `0.625rem` | 500 |
| Secondary | `--paper-raised` | Ink | `0.625rem` | 500 |
| Ghost | Transparent | Ember | `0.625rem` | 500 |

Hover moves to `--ember-hi`, pressed to `--ember-deep`. Primary CTA carries
`--shadow-ember`; nothing else does.

### Icons

Lucide React, `strokeWidth` **1.75**, sized to the text beside them — 14px in
dense UI, 18px in feature cards, 24px standalone. Never mix stroke weights in
one view; never use a filled icon set alongside them.

### Surfaces

Cards: `--paper-card` fill, 1px `--rule` border, `0.625rem` radius,
`--shadow-paper-sm`. Elevation goes up one step on hover, never two. Warm
shadows only — a neutral grey shadow reads as a foreign component.

### Motion

Interface transitions 150–200ms ease. Brand motion (logo ripples, waveform,
recording dot) is slow and looping — 1.2s to 2.8s — because it signals *live*,
not *look at me*. Everything animated has a `prefers-reduced-motion` off-switch.

---

## 7. Voice

Conversational, not corporate. Outcome first — lead with what the user gets,
not what the system does. Confident without superlatives. Specific about India:
name the languages, say WhatsApp, price in ₹.

**Write**
> Every meeting, *briefed.* Bot joins, records, and files the notes before you're
> out of the room.

**Don't write**
> EchoBrief is a cutting-edge, AI-powered meeting intelligence platform that
> revolutionises how teams capture insights!

Banned: "AI-powered", "cutting-edge", "next-gen", "revolutionary", "seamless",
"unlock". No exclamation marks. No em-dash-strung hype. Error messages say what
happened and what to do, never apologise twice.

---

## 8. Rules that break the brand if ignored

1. One ember per view.
2. Ember never means a status. Recording is `--stop`, not ember.
3. No cool greys, ever. Every neutral here is warm-tinted.
4. Gradient only on: logomark, app icon, hero CTA, 4px section bar.
5. Gold is a fill, not a text colour on light.
6. No serif inside the app; no Manrope outside brand surfaces.
7. One italic phrase per headline, one eyebrow per section.
8. Never rebuild the wordmark — use the files in [`logo/`](logo).
9. Every motion has a reduced-motion fallback.
10. If a token doesn't exist, add it to `src/index.css` **and**
    [`tokens/colors.json`](tokens/colors.json) — don't hardcode a one-off hex.

Rules 1–10 are stated here; rules 3, 5, 6, 8 and 10 are *enforced* by
`npm run brand:check`, which gates both `npm run build` and every commit. See
[README.md](README.md#enforcement).
