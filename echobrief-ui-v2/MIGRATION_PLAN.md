# EchoBrief UI v2 — migration plan (zero downtime)

Stack: React 18 + Vite + TypeScript, Supabase. Presentation-layer change only.

## Principle
Swap the JSX, keep the wiring. Every page keeps its hooks, queries, mutations and handlers; only the render tree is rebuilt from the shared kit. Each page ships behind a per-user feature flag so the live app keeps working and any page can be rolled back instantly.

## Phase 0 — foundation (1–2 days, no visible change)
- Brand system update per `BRAND_DECISION.md` (decided: ratify the mockup palette). Tokens from `ui-kit/tokens.css` go into `brand/tokens/colors.json` + `src/index.css` + `tailwind.config`; `brand-check.mjs` lists updated (Outfit/DM Sans un-banned, retired greys/green re-allowed, new hexes allowed). Old tokens kept under `legacy` until V1 is deleted. `npm run brand:check` must pass before Phase 0 ships.
- `lucide-react`; brand marks → `public/brands/`.
- Kit in `src/ui/` rewritten as Tailwind utilities on top of the existing shadcn primitives (extend `Button`, `Badge`, `Tabs` variants rather than duplicating). `ui-kit/components/*.tsx` are a **reference** for props, sizes and states — not drop-in code.
- Feature flag `ui_v2`: boolean on the profile row (or `app_config`), read once at app load; `?ui=v2` / `?ui=v1` override stored in sessionStorage.
- Deploy. Nothing changes for users.

## Phase 1 — shell (2–3 days)
- `AppShellV2` (sidebar + header + content frame per DESIGN_SPEC §1). Route between shells on the flag; V1 pages render inside V2 shell unchanged.
- Strip page-level padding/headings that fight the frame.

## Phase 2 — pages, one at a time
Order: Settings (Account → Bot → Integrations → Billing → Security → Developer) → Action items → Meetings home → Meeting detail (Summary, then Recording) → Calendar → Contacts → Coaching → Ask → Workspace.
Per page: copy `Page.tsx` → `PageV2.tsx`; keep all logic exactly as it is (including `Settings.tsx` staying on `useState` — do not migrate it to TanStack Query as part of this work); rebuild JSX against the mockup; route to V2 when flag on. Never edit V1 while V2 is in progress.
Rollout per page: yourself for a day → co-founders → everyone.

## Guardrails
- Both shells resolve every route; no 404s mid-migration.
- Flag is per user; only testers see V2.
- Smoke checklist before widening any page:
  1. Record a meeting and see it appear in the list.
  2. Open a meeting → summary, action items, transcript load.
  3. Tick / untick an action item; it persists after reload.
  4. Connect and disconnect a calendar.
  5. Sign out, sign in.
- Watch bundle size (per-icon lucide imports; no new heavy deps).

## Recording tab (only new behaviour)
- Source: the Recall-signed MP4 URL returned by `get-recording-media`, resolved per view (short-lived — refetch on expiry / on tab open). The MP4 is deliberately NOT in Supabase Storage; do not look for a bucket object. `<video src={signedUrl}>` with custom controls (play/skip/time/speed/captions/volume/fullscreen).
- Transcript follows `currentTime` using segment timestamps; chapter chips call `video.currentTime = t`.
- "Who spoke when" bar from diarization segments; speaker colours from tokens.
- Build after the rest of Meeting detail is on V2.

## Feature parity rule
The mockups show only features that exist. If a mockup element has no backing route/function (verify with grep before building), leave it out and flag it — never ship UI for a feature that does not exist. Known removals already applied: WhatsApp delivery, Gmail branding (email is Resend), early-access code redemption.

## Mobile
Same kit. Below 768px: `AppShellV2` swaps the sidebar for the bottom tab bar (Meetings · Calendar · Tasks · Ask · More); More is a hub page linking Contacts, Coaching, Workspace, Settings. Two-column pages stack. Do it after desktop pages are on V2.

## Cleanup
After every page has been on V2 for all users for a week: delete V1 files and the flag; rename V2 → plain names; drop the `legacy` token key. Then schedule the marketing surfaces (landing page, email templates, Slack messages, brand PDF) onto the new palette as a separate piece of work.

Estimate: 3–4 weeks part-time. Risk concentrates in Phase 1; Phase 2 is mechanical.
