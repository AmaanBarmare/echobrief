# Operations

> Deploying, scheduled jobs, monitoring, alerts, and what to do when something is
> stuck.

- [Environments](#environments)
- [Deploying](#deploying)
- [Environment variables](#environment-variables)
- [Scheduled jobs](#scheduled-jobs)
- [Monitoring and alerts](#monitoring-and-alerts)
- [Incident playbook](#incident-playbook)
- [Cost and quota ceilings](#cost-and-quota-ceilings)

Related: [Errors runbook](../errors.md) · [Testing](testing.md) · [Edge functions](edge-functions.md)

---

## Environments

| Surface | Host | Deploy mechanism |
|---|---|---|
| React SPA | Vercel | GitHub auto-deploy on push to `main` |
| `api/split-audio` | Vercel (same project) | GitHub auto-deploy on push |
| Edge Functions | Supabase | `supabase functions deploy <name>` |
| Migrations | Supabase | `supabase db push` |

> The Vercel account that owns `echobrief.in` is **separate from the local CLI login**.
> Do not `vercel deploy` — push to `main` and let auto-deploy run.

---

## Deploying

Run the gates first. All of them.

```bash
npm run lint
npm run build                                 # type errors surface here, not in CI
npm run test:unit                             # 53 tests, <1 s
python3 scripts/pipeline-test/harness.py      # 12/12, ~90 s against real prod
python3 scripts/evals/run_evals.py            # 8 evals, exit code gates the deploy
```

Add `--live` to the harness before any risky pipeline change — it exercises the real
Sarvam contract and is the test that catches upstream regressions.

Then:

```bash
supabase functions deploy sarvam-webhook      # one function
supabase db push                              # pending migrations
git push origin main                          # frontend + split-audio
```

Re-run the harness **after** the deploy too. It has already caught two real production
bugs that would otherwise have reached users: the missing `error_message` column and
the `transcribing` deadlock.

---

## Environment variables

### Frontend (`.env`, Vercel project env)

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Anon key — public by design; RLS is the control |
| `VITE_SUPABASE_PROJECT_ID` | Project identification |
| `VITE_SENTRY_DSN` | Optional. Sentry DSN for frontend error reporting — unset means Sentry never initialises (build-time flag; `tracesSampleRate` 0.1, environment from the Vite mode) |
| `VITE_GOOGLE_SIGNIN` | Optional, default hidden. `true` shows the "Continue with Google" button on `/auth`. Enable after the Supabase Auth → Google provider is pointed at a live OAuth client whose authorized redirect URIs include `https://lekkpfpojlspbuwrtmzt.supabase.co/auth/v1/callback` — the current provider references a deleted client and the button would fail |

### Edge Functions (Supabase secrets)

| Variable | Purpose |
|---|---|
| `OPENAI_API_KEY` | Whisper fallback + GPT-4o-mini insights + chat |
| `SARVAM_API_KEY` | Primary STT |
| `SARVAM_WEBHOOK_SECRET` | Sarvam callback validation |
| `RECALL_API_KEY` | Bot orchestration |
| `RECALL_API_BASE_URL` | Optional; defaults to `https://us-east-1.recall.ai` |
| `RESEND_API_KEY` | Email delivery |
| `ALERT_EMAIL_TO` | Monitor alert recipient (default `admin@oltaflock.ai`) |
| `SPLIT_AUDIO_URL` | `https://www.echobrief.in/api/split-audio`. **Unset → silent fallback to direct single-file Sarvam**, which returns empty for long audio. |
| `SPLIT_AUDIO_SECRET` | Shared bearer secret — must match the Vercel env var |
| `HARNESS_EMAILS` | `true` only for a deliberate delivery-verification run. Unset it afterwards. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Calendar OAuth |
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` | Injected by the platform |

### Vercel functions

| Variable | Purpose |
|---|---|
| `SARVAM_API_KEY` | `split-audio` submits chunks directly |
| `SPLIT_AUDIO_SECRET` | Same value as the Supabase secret |
| `OPENAI_API_KEY` | `transcribe: "whisper"` mode. Missing → the mode 500s and long meetings fail instead of falling through to whole-file Whisper. |

> **`.env` is the source of truth.** A credential change must be propagated to
> **both** Supabase secrets and Vercel env, then verified. Supabase secret digests are
> `sha256` — you can check a deployed secret against `.env` without overwriting it.

---

## Scheduled jobs

Four pg_cron jobs invoke Edge Functions over HTTP via `pg_net`.

| Job | Schedule | What it does |
|---|---|---|
| `auto-join-meetings` | `*/5 * * * *` | Dispatch bots to calendar meetings starting within 7 min |
| `monitor-stuck-meetings` | `*/15 * * * *` | Detect + recover + alert on meetings stuck >15 min |
| `prune-job-logs` | `15 3 * * *` | Trim `cron.job_run_details` (>7 d) and `net._http_response` (>1 d) |
| `prune-recordings` | `30 3 * * *` | Clear archived audio older than 30 d (7 d when the bucket is near cap) |

### ⚠️ Do not raise these frequencies

The database doubles as the job scheduler. Every tick writes a `pg_net` request row, a
response row, and a `cron.job_run_details` row. On a small compute instance that
**write churn** — not reads — is what depletes the Disk IO Budget.

Root-caused 2026-06-13: the `net.http_post` calls these crons fired were **94.4% of
all database execution time**. The dataset itself is tiny and fully cached (hit rate
1.00); reads were never the problem.

Before making any cron more frequent, confirm headroom:

```bash
supabase inspect db db-stats     # cache hit rate
supabase inspect db outliers     # top queries by total time
```

If finer scheduling is genuinely needed, move it **off the database** to a free
external scheduler (cron-job.org, GitHub Actions) calling the Edge Functions directly.
Not Vercel Cron — its free tier caps at once per day. Not a paid compute upgrade.

`cron.schedule()` with an existing job name updates that job in place, which is why
the frequency migrations re-declare jobs rather than unscheduling first.

---

## Monitoring and alerts

`monitor-stuck-meetings` is the safety net. Every detection writes a `monitor_events`
row (deduped per meeting + signature + hour). Email goes to `ALERT_EMAIL_TO` from
`hello@echobrief.in` via Resend.

| Subject prefix | Meaning | Action |
|---|---|---|
| `[ECHOBRIEF]` | Known signature, canonical recovery **failed** | Follow the recovery in [`errors.md`](../errors.md) |
| `[ECHOBRIEF NEW ERROR]` | Signature not in `KNOWN_PATTERNS` | Investigate, then add the signature to **both** `errors.md` and [`known-patterns.ts`](../supabase/functions/monitor-stuck-meetings/known-patterns.ts) |
| `[ECHOBRIEF HARNESS TEST]` | A `[harness]` meeting triggered an alert | Suppressed unless `HARNESS_EMAILS=true`. The `monitor_events` row is written either way. |

> `echobrief.in` is the only verified sending domain on the Resend account.
> `oltaflock.ai` is **not** verified — any from-address on it returns 403.

> Resend returning 403 with `"error code: 1010"` is **Cloudflare, not auth** — it bans
> Python's default `urllib` User-Agent. Set a real UA before concluding the key is bad.

### Auth mail (password reset, invites)

The templates live in project config too, not in this repo. Regenerate and push
them from the shared shell:

```bash
npm run emails:auth        # render supabase/auth-emails/*.html
npm run emails:auth:push   # PATCH the live project, then read it back to verify
```

Auth mail does **not** go through the edge functions — Supabase Auth talks to Resend
over SMTP, configured on the project, not in this repo. Symptom of a stale key:
`POST /auth/v1/recover` returns `500 unexpected_failure` / `"Error sending recovery email"`.

Read and write it with the Management API (the CLI has no command for it):

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -H "Authorization: Bearer $TOK" \
  https://api.supabase.com/v1/projects/$PROJECT_REF/config/auth
```

> **`smtp_*` is an all-or-nothing group.** PATCHing `smtp_pass` alone silently clears
> `smtp_host`, `smtp_port`, `smtp_user`, `smtp_admin_email` and `smtp_sender_name`, which
> drops the project back to Supabase's rate-limited default sender. Always send the whole
> block: host `smtp.resend.com`, port `587`, user `resend`, pass = the Resend API key,
> admin email `noreply@echobrief.in`, sender name `EchoBrief`.

> The `smtp_pass` the API reads back is a **masked digest, and not a plain sha256 of the
> key** — unlike edge-function secrets, you cannot diff it against `.env` to tell whether
> the stored key is current. Verify the key itself with an SMTP login
> (`smtplib`, `login("resend", key)`), then confirm the config end-to-end by calling
> `/auth/v1/recover` and checking for `200` rather than `500`.

---

## Incident playbook

### A meeting is stuck

1. Read `meetings.status` and `error_message`.
2. Check `monitor_events` for a signature on that meeting.
3. Look the signature up in [`errors.md`](../errors.md) and apply its recovery.
4. If there is no signature, read the Edge Function logs for the stage the status
   implies (`processing` → `sarvam-webhook`; `joining`/`recording` → `recall-webhook`).

### Every meeting is silently empty

Check the **storage bucket first**. When `recordings` hits its cap, uploads fail
without raising, `recall-pipeline` cannot produce a signed URL for the splitter, long
audio falls through to whole-file Sarvam (empty above ~6 min) and then whole-file
Whisper (rejects >25 MB). Transcription had been dead for six days before anyone
noticed in the 2026-08-20 incident. Signature `storage:bucket_full_blocks_pipeline`.

Then check `SPLIT_AUDIO_URL` is set — unset means a silent fallback to the path that
returns empty transcripts for long audio.

### Manual recovery

[`scripts/recover_meeting.py`](../scripts/) style recovery: download the audio from
Storage, run Whisper locally, call GPT-4o-mini, write transcript + insights + status.
Used when both Sarvam and the in-edge Whisper fall through — typically long-audio OOM.

### Regenerating insights

`saveInsights` **only inserts**. Delete the `meeting_insights` row first, or the
regeneration will silently no-op.

---

## Cost and quota ceilings

| Resource | Ceiling | Consequence of hitting it |
|---|---|---|
| Supabase Storage | 1 GB free tier | Uploads fail silently → whole pipeline degrades |
| Supabase Disk IO Budget | small-instance quota | Cron write churn depletes it; queries slow |
| Vercel function duration | 300 s (Hobby) | `split-audio` returns a logged 504 at its 270 s budget |
| Sarvam batch job | 20 files | Caps a single job at 100 minutes of audio at 300 s chunks |
| OpenAI Whisper upload | 25 MB | Whole-file fallback rejects long meetings |
| Supabase Edge Function memory | ~256 MB | In-edge Whisper OOMs above ~15 MB of audio |
