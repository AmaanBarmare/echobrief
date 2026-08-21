# EchoBrief — Logo

The mark is three concentric rings: an outer ripple, an inner ripple, and a
solid core. It reads as sound leaving a source — and as attention narrowing to
a single point. The ripples fade outward (28% and 52% opacity) so the core
always wins the eye.

All files: [`logo/svg/`](logo/svg) (vector, text converted to outlines — no font
needed) and [`logo/png/`](logo/png) (raster).

---

## 1. Files

| File | What it is | Use for |
|---|---|---|
| `echobrief-lockup-light.svg` | Mark + wordmark, ember gradient, ink text | Light backgrounds — site header, docs, invoices |
| `echobrief-lockup-dark.svg` | Mark + wordmark, brighter ember, bone text | Dark backgrounds — dark UI, dark decks |
| `echobrief-lockup-mono-black.svg` | Single-colour ink | Print, fax-grade output, engraving, one-colour partners |
| `echobrief-lockup-mono-white.svg` | Single-colour bone | Photography, video overlay, dark one-colour |
| `echobrief-mark.svg` | Ring mark only, ember→gold gradient | Avatars, favicons above 32px, watermarks, loaders |
| `echobrief-mark-dark.svg` | Ring mark, dark-mode ember | Dark UI chrome |
| `echobrief-mark-mono-black.svg` / `-white.svg` | Ring mark, one colour | Stamps, embossing, single-colour print |
| `echobrief-icon.svg` | Squircle app icon, gradient ground, white rings | App icon, favicon, social avatar, OG tile |

PNG exports sit in `logo/png/` — lockups at 376×144, every mark variant at
512×512, and the app icon at 1024 / 512 / 256 / 128 / 64 / 32. Regenerate them
from the SVGs with `bash brand/src/build-pngs.sh` rather than upscaling.

The in-app React implementation is [`src/components/ui/Logo.tsx`](../src/components/ui/Logo.tsx)
— it draws the mark live so it inherits the theme's ember and animates the
ripples. Use the component in the app; use these files everywhere else.

---

## 2. Construction

Drawn on a 32-unit grid.

| Element | Geometry |
|---|---|
| Outer ring | r 14, stroke 1.2, opacity 0.28 |
| Inner ring | r 9, stroke 1.2, opacity 0.52 |
| Core | r 4.5, solid |
| Fill | `linear-gradient(135deg, ember → gold)` |

In the lockup the mark is scaled 1.5× (48px against 32px type) and the wordmark
baseline is optically centred on the mark, not mathematically — the serif's cap
height sits the text 0.3 units below true centre.

### Wordmark

**DM Serif Display**, 32px, tracking −0.04em. `echo` in roman `--ink`,
`brief` in **italic** `--ember`. The italic is the whole idea: the echo is
plain, the brief is the emphasis. It is the same move the brand copy makes with
its one-italic-phrase rule.

Wordmark text in the SVG files is converted to outlines, so the files render
identically with or without DM Serif Display installed.

---

## 3. Clear space and minimum size

**Clear space** on all four sides equals the diameter of the core — 9 units on
the 32-unit grid, or 28% of the mark's height. Nothing enters that zone: no
text, no rules, no crop edge, no other logo.

**Minimum sizes**

| Asset | Screen | Print |
|---|---|---|
| Full lockup | 120px wide | 32mm wide |
| Mark alone | 24px | 8mm |
| App icon | 16px | — |

Below 24px the outer ring at 28% opacity disappears. If you need the mark
smaller, use the app icon (solid ground, white rings) instead — it holds down
to 16px.

---

## 4. Placement

- On light surfaces: `echobrief-lockup-light`.
- On dark surfaces: `echobrief-lockup-dark` — not the light file inverted.
- On photography or video: mono white, over an area of even tone. If the
  background is busy, put the lockup on a paper or char plate rather than
  adding a shadow or outline to the logo.
- Against an ember or gradient ground: mono white only.

---

## 5. Don'ts

- Don't rebuild the wordmark in another font, or set it in Switzer/Manrope.
- Don't set `brief` in roman, or `echo` in italic. The contrast is the mark.
- Don't recolour the rings individually, or change their opacities.
- Don't stretch, rotate, skew, or arc the lockup.
- Don't add drop shadows, glows, bevels, or outlines.
- Don't place the lockup on ember, gold, or the gradient in its colour form.
- Don't crop the rings or let them bleed off an edge.
- Don't lock the logo up with another wordmark without clear space between them.
- Don't animate the ripples anywhere except the app's own `Logo` component,
  where the motion is already tuned (2.8s, and disabled under
  `prefers-reduced-motion`).
