# EchoBrief Brand Kit

Everything needed to keep EchoBrief on brand. The app's live implementation in
[`src/index.css`](../src/index.css) is the source of truth; these files document
it and make it portable to decks, email, print, and partner surfaces.

| File | What's in it |
|---|---|
| [**EchoBrief-Brand-Guidelines.pdf**](EchoBrief-Brand-Guidelines.pdf) | The whole identity, designed, printable, shareable |
| [IDENTITY.md](IDENTITY.md) | Master document — idea, colour, type, logo, UI signatures, voice, rules |
| [COLORS.md](COLORS.md) | Full palette, tints, shadows, measured contrast ratios |
| [TYPOGRAPHY.md](TYPOGRAPHY.md) | Both type stacks, scales, the italic accent rule |
| [LOGO.md](LOGO.md) | Construction, files, clear space, minimum sizes, don'ts |
| [tokens/colors.json](tokens/colors.json) | Machine-readable palette |
| [tokens/colors.css](tokens/colors.css) | Drop-in CSS custom properties, light + dark + hex fallbacks |
| [tokens/typography.css](tokens/typography.css) | Drop-in font imports and type classes |
| [logo/svg/](logo/svg) | Vector logos — wordmark converted to outlines, no font needed |
| [logo/png/](logo/png) | Raster exports |
| [src/](src) | HTML source of the PDF, and the build script |

## Enforcement

Docs don't enforce anything — [`scripts/brand-check.mjs`](../scripts/brand-check.mjs) does.

```bash
npm run brand:check
```

It fails on off-palette hex, retired palette values, non-approved fonts, banned
marketing words, logo files that have drifted from `logo/svg/`, and references
to removed assets. It is wired into two gates:

- **`npm run build`** — nothing off-brand can be deployed.
- **`githooks/pre-commit`** — nothing off-brand can be committed. The hook path
  is set by `npm run prepare`, so a fresh clone gets it on `npm install`.
  Genuine emergency override: `git commit --no-verify`.

The allowed palette is read from [`tokens/colors.json`](tokens/colors.json), so
**a new colour becomes legal by being added there and to `src/index.css`** —
never by hardcoding it. A deliberate one-off exception takes a
`// brand-check-ignore` comment on that line.

`docs/` is excluded: those are internal engineering notes, not a customer
surface.

### HTML email

Email supports neither CSS variables nor `color-mix()`, and won't reliably load
webfonts at all. The `email` block of `tokens/colors.json` holds the flat,
pre-composited tints and the fallback font stacks to use instead. Take values
from there rather than eyeballing a new hex.

**Do not build a new email layout.** Every mail EchoBrief sends is rendered from
one shell — [`supabase/functions/_shared/email-brand.ts`](../supabase/functions/_shared/email-brand.ts):
the meeting summary, the report a user forwards, the pipeline alert, and the
Supabase Auth mails (reset, invite, confirm, magic link, email change). The auth
templates are the odd ones out — Supabase renders them from project config, not
from this repo — so they are generated into
[`supabase/auth-emails/`](../supabase/auth-emails/) with `npm run emails:auth`
and pushed with `npm run emails:auth:push`. That indirection is why they sat on
a retired navy-and-orange palette long after everything else moved: nothing here
rendered them, so nothing flagged them.

## Quick facts

- System name: **Warm Dispatch**
- Primary: **Ember** `#D93F0B` (light) / `#E8430A` (dark)
- Accent: **Gold** `#F5C842`
- App type: **Switzer** + JetBrains Mono
- Brand type: **DM Serif Display** + Manrope + IBM Plex Mono
- Logo: three concentric ripples, `echo` roman + *`brief`* italic

## Rebuilding the PDF

```bash
node brand/src/build-pdf.mjs
```

Needs Google Chrome installed. Renders [`src/guidelines.html`](src/guidelines.html)
to `EchoBrief-Brand-Guidelines.pdf`.

## Regenerating the logo files

The wordmark paths in `logo/svg/` were generated from DM Serif Display Regular
and Italic and baked to outlines. Don't hand-edit the path data — if the
wordmark ever changes, regenerate:

```bash
pip install fonttools && python3 brand/src/build-lockups.py   # SVGs
bash brand/src/build-pngs.sh                                  # PNG exports
```
