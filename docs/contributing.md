# Contributing

> Local setup, the rules that are actually enforced, and what to do before you commit.

- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running locally](#running-locally)
- [Project rules](#project-rules)
- [Before you commit](#before-you-commit)
- [Adding an Edge Function](#adding-an-edge-function)
- [Adding a migration](#adding-a-migration)
- [Documenting a new error](#documenting-a-new-error)
- [Conventions](#conventions)

---

## Prerequisites

- Node.js 18+
- npm
- Supabase CLI (Edge Functions and migrations)
- Deno (bundled with the Supabase CLI; used by `npm run test:unit`)
- Python 3.11+ (harness and evals)
- A Supabase project, plus API keys for OpenAI, Sarvam, Recall, Resend, and Google OAuth

## Setup

```bash
git clone <repo-url>
cd echobrief
npm install
cp .env.example .env          # fill in the VITE_* values
```

Edge Function secrets go in `supabase/.env.local` for local serving, and in Supabase
secrets for deployed functions. Full variable list in
[Operations § environment variables](operations.md#environment-variables).

## Running locally

```bash
npm run dev              # Vite dev server on :8080
npm run functions:serve  # Edge Functions, reads supabase/.env.local
npm run lint
npm run build            # also the type-check
```

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server, port 8080 |
| `npm run build` | Production build (surfaces type errors) |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Preview the built frontend |
| `npm run lint` | ESLint |
| `npm run functions:serve` | Serve Edge Functions locally |
| `npm run test:unit` | 104 deno tests, mocked fetch, <1 s |
| `python3 scripts/pipeline-test/harness.py` | 11-scenario integration harness against deployed functions |
| `python3 scripts/evals/run_evals.py` | 8-eval output-quality suite |
| `python3 scripts/evals/run_evals.py --meeting-id <id>` | Grade a live production meeting |
| `python3 scripts/evals/run_evals.py --snapshot <id>` | Freeze a prod meeting into the eval dataset |

---

## Project rules

These are not aspirational. They come from bugs that reached production.

### The 95% confidence rule
Do not make a code change unless you are 95% confident it is correct. If you are not,
explain the concern and ask first. This applies to bug fixes, features, and refactors
equally.

### Test before committing or deploying
Verify the change actually works. Frontend → `npm run build` plus a look at the dev
server. Edge Function → `npm run functions:serve` and exercise the endpoint. Migration
→ apply locally and inspect the result. "It looks right" is not verification.

### Run the unit harness on any shared-logic change
`npm run test:unit`. Under a second, no production contact, and it covers exactly the
pure logic that is easiest to break silently.

### Run the pipeline harness before deploying a function or migration
`python3 scripts/pipeline-test/harness.py`. 12/12 must pass. It has already caught two
real production bugs. Add `--live` before risky pipeline deploys.

### Run the evals before touching transcription or prompts
`python3 scripts/evals/run_evals.py`. The exit code gates the deploy.

### Update `errors.md` and `known-patterns.ts` together
They mirror each other. Updating only one makes the monitor's judgment diverge from
the runbook.

### Do not raise pg_cron frequency without checking the Disk IO Budget
See [Operations § scheduled jobs](operations.md#scheduled-jobs). This has bitten the
project once already.

---

## Before you commit

```bash
npm run lint
npm run build
npm run test:unit
python3 scripts/pipeline-test/harness.py     # if you touched a function or migration
python3 scripts/evals/run_evals.py           # if you touched transcription or prompts
```

---

## Adding an Edge Function

1. `supabase/functions/<name>/index.ts`.
2. Add a `[functions.<name>]` block to [`supabase/config.toml`](../supabase/config.toml)
   with an explicit `verify_jwt`. **Decide deliberately** — see
   [Security § function auth](security.md#edge-function-authentication).
3. Reuse `_shared/` (`cors.ts`, `rate-limit.ts`) rather than re-implementing.
4. If the operation is user-scoped, prefer the **caller's JWT** over the service role
   so RLS does the scoping.
5. Add it to [`docs/edge-functions.md`](edge-functions.md).

## Adding a migration

1. `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`.
2. Apply locally and inspect.
3. Regenerate types if the frontend needs the new columns:
   `supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts`
4. Update [`docs/database.md`](database.md) if it changes the model.
5. `cron.schedule()` with an existing job name **updates in place** — no unschedule
   needed.

## Documenting a new error

When the monitor emails `[ECHOBRIEF NEW ERROR]`:

1. Investigate and find the root cause.
2. Add the signature to [`errors.md`](../errors.md) — cause, recovery, status.
3. Add the same signature to
   [`known-patterns.ts`](../supabase/functions/monitor-stuck-meetings/known-patterns.ts)
   with its recovery action.
4. If it is reproducible, add a harness scenario so it cannot come back unnoticed.

---

## Conventions

- TypeScript strict mode.
- Tailwind for all styling — no CSS modules.
- shadcn/ui primitives live in `src/components/ui/` and are **generated**. Do not edit
  them; build custom components in `src/components/dashboard|meeting|landing/`.
- React Router v6, `ProtectedRoute` for auth-gated pages.
- TanStack Query for server state; React Context for client state (auth, recording,
  theme). Global defaults: `staleTime` 60 s, `refetchOnWindowFocus: false`.
- Edge Functions import shared logic from `supabase/functions/_shared/`.
- Brand colours and typography in [`BRAND.md`](../BRAND.md).
