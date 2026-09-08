# Prompt for Claude Code — EchoBrief UI v2 migration

Copy everything below the line into Claude Code as the first message, from the repo root.

---

We are migrating the EchoBrief dashboard (React 18 + Vite + TypeScript, Supabase) to a new UI. The complete design handoff is in `./echobrief-ui-v2/`. Before writing any code:

1. Read `echobrief-ui-v2/BRAND_DECISION.md` — the decision is recorded there: the mockup palette and fonts are ratified as the new brand. Phase 0 starts by updating the brand system (`colors.json`, `index.css`, `tailwind.config`, `brand-check.mjs` data) so `npm run brand:check` passes *with* the new tokens. Never bypass or disable the checker or the pre-commit hook. Then read `DESIGN_SPEC.md` (frame, components, rules) and `MIGRATION_PLAN.md` (phases, guardrails).
2. Look at every image in `echobrief-ui-v2/mockups/desktop/` and `mockups/mobile/` — these are the target screens. When you need exact values, open the matching file in `mockups/html/` and read the inline styles.
3. Explore the current codebase: find the router, the app shell/sidebar, the page components, how styling is done today (Tailwind, CSS modules, or inline styles), the icon library, and how user/profile data is loaded. Summarise what you find in a short note before changing anything.

Rules for the whole migration:
- This is a presentation-layer change only. Do not touch Supabase schema, RLS, auth, the bot pipeline, Sarvam/OpenAI calls, or delivery integrations.
- Keep every existing hook, query, mutation and handler. Only the JSX/render tree is rebuilt.
- Work behind a per-user `ui_v2` feature flag with a `?ui=v2` / `?ui=v1` query override. V1 must keep working untouched until V2 is on for everyone.
- One page per PR-sized change. Build `XxxV2.tsx` next to `Xxx.tsx`; never edit the V1 file while its V2 is in progress.
- Tokens go into the repo's existing brand system (`brand/tokens/colors.json`, `src/index.css`, `tailwind.config`) using the values in `ui-kit/tokens.css` verbatim. `npm run brand:check` must pass on every commit — never bypass the pre-commit hook; update its allow/ban lists per BRAND_DECISION.md instead. Keep the old Warm Dispatch tokens under a `legacy` key until V1 is deleted. `ui-kit/tokens.css` and `ui-kit/components/*.tsx` are reference material for sizes, radii, shadows and component props; rebuild them as Tailwind utilities on top of the existing shadcn primitives.
- Feature parity: only build UI for features that exist in `src/` and `supabase/functions/`. Verify with grep. No WhatsApp, no Gmail branding (email delivery is Resend), no early-access code flow.
- The Recording tab's video source is the Recall-signed URL from `get-recording-media` (per view, short-lived). The MP4 is not in Supabase Storage.
- `Settings.tsx` stays on `useState`; V2 keeps that. Do not migrate state management as part of this work.
- Icons: `lucide-react` only (already in the repo via shadcn), 1.75px stroke. No emoji anywhere in the UI. Brand marks from `echobrief-ui-v2/brands/` copied to `public/brands/`.
- Shape language: buttons, chips, tabs, selects, search and icon buttons are pills (999px). Cards 14px. Inputs 9px. Tabs are dark-filled chips, never underlines.
- Every page uses `PageHeader` so the H1 lands at the same position on every page.
- After each page, run the smoke checklist in MIGRATION_PLAN.md and tell me what to verify manually.

Start with Phase 0 (brand-system update, fonts, kit, flag) — no visible change to the live app. Show me the plan for Phase 0 as a file list before you write it, then proceed.
