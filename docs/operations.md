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
npm run test:unit                             # 326 tests, <1 s
npm run test:rls                              # 69 isolation assertions, if a policy or table changed
python3 scripts/pipeline-test/harness.py      # 12/12, ~90 s against real prod
python3 scripts/evals/run_evals.py            # 11 evals, exit code gates the deploy
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
| `VITE_GOOGLE_SIGNIN` | `true` in all three Vercel environments since 2026-08-31, which shows the "Continue with Google" button on `/auth`. Vite inlines `VITE_*` at build time, so changing it requires a **redeploy**, not just an env edit. Set it back to `false` to pull the button without a code change. The Supabase Auth → Google provider must point at a live OAuth client whose authorized redirect URIs include `https://lekkpfpojlspbuwrtmzt.supabase.co/auth/v1/callback` (client `226681308853-qpq87ckp…`; the prior client was deleted and returned `deleted_client`) |

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

Three pg_cron jobs invoke Edge Functions over HTTP via `pg_net`; two more are pure
SQL (`prune-job-logs` at `45 21 * * *`, `prune-oauth` at `45 3 * * *`).

| Job | Schedule | What it does |
|---|---|---|
| `auto-join-meetings` | `*/5 * * * *` | Dispatch bots to calendar meetings starting within 7 min |
| `monitor-stuck-meetings` | `*/15 * * * *` | Detect + recover + alert on meetings stuck >15 min |
| `prune-recordings` | `0 22 * * *` (03:30 IST) | Clear archived audio once transcribed (see the function header for retention) |

### The Vault `service_role_key` secret (required)

The HTTP-invoked functions require a service-role bearer (`verify_jwt = true` +
`authenticate()`), so each cron tick builds its `Authorization` header from Supabase
Vault at execution time
(`20260831190000_cron_service_auth.sql`):

```sql
headers := jsonb_build_object(
  'Content-Type', 'application/json',
  'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key')
)
```

To (re)create the secret — e.g. after rotating the service-role key — run in the SQL
editor:

```sql
select vault.create_secret('<service role jwt>', 'service_role_key');
-- rotation: select vault.update_secret(id, new_secret := '<new jwt>')
--           with the id from: select id from vault.secrets where name = 'service_role_key';
```

No secret literal is ever stored in `cron.job` or a migration; a rotated Vault secret
takes effect on the next tick without rescheduling. **If the secret is missing, every
HTTP cron tick 401s silently** — the migration refuses to apply without it, but check
here first if all three jobs stop producing effects.

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

## Backups and restore

> **Connection host — do not change this back.** The direct host
> `db.lekkpfpojlspbuwrtmzt.supabase.co` is **IPv6-only** (it has an AAAA record and no
> A record) and GitHub-hosted runners have no IPv6, so a dump against it never connects.
> The workflow therefore uses the **session-mode pooler**:
> `aws-1-ap-southeast-2.pooler.supabase.com`, port **5432**, user
> **`postgres.lekkpfpojlspbuwrtmzt`**. Port 6543 on the same host is *transaction* mode
> and will not work for `pg_dump`. `scripts/backup/restore.sh` refuses either route to
> production unless `--i-really-mean-it` is passed — the project ref appears in both the
> direct hostname and the pooler username, which is what makes that guard work.


Supabase Free has **no backups and no PITR**, so we run our own: a GitHub Actions
job ([`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml))
takes a nightly `pg_dump` at **02:30 UTC** (chosen to stay clear of the prod
pg_cron jobs at 21:45, 22:00 and 03:45 UTC), gzips it, encrypts it with
AES-256-CBC (PBKDF2, 200k iterations), and uploads it as a **release asset** on
the private repo `Oltaflock-AI/echobrief-backups`, tagged `backup-YYYY-MM-DD`.
Releases older than 30 days are pruned by the same job. The main repo is
**public**, so dumps must never be committed here or stored as Actions
artifacts (public-repo artifacts are world-downloadable) — release assets on
the private repo are the only sanctioned destination.

### What the dump covers — and what it does not

Covered (both files inside one encrypted `.tar.gz.enc`):

- **`public` schema, schema + data** (`public.sql`) — meetings, transcripts,
  meeting_insights, profiles, contacts, tokens, billing ledger, everything.
- **`auth.users`, schema + data** (`auth_users.sql`) — user accounts. The
  `postgres` role can read this table; the job **fails loudly** if that ever
  stops being true, rather than silently shipping a backup with no users.

NOT covered — be honest with yourself about this before you need a restore:

- **Supabase-managed schemas** (`storage`, `vault`, `extensions`, `graphql`,
  `realtime`, `supabase_functions`, the rest of `auth`): mostly not dumpable by
  the `postgres` role and not restorable into another project anyway.
  Consequences: users keep their accounts and profiles but **lose sessions,
  refresh tokens, and MFA factors** (they sign in again; Google OAuth tokens
  are ours and live in `public.user_oauth_tokens`, so calendar reconnects
  survive), and **Vault secrets** (the cron `service_role_key`) must be
  re-created per the section above.
- **Storage objects** (the `recordings` bucket): deliberately out of scope.
  Archived audio is transient by design — pruned at 30 days, and every meeting
  that matters already has its transcript in `public`.
- **Project configuration**: auth email templates (in `supabase/auth-emails/`,
  re-push with `npm run emails:auth:push`), edge-function secrets (source of
  truth is `.env` — see Environment variables), migrations (this repo).

### Secrets

Three GitHub Actions secrets on the **main** repo (Settings → Secrets and
variables → Actions). Both workflows refuse to run with a clear error if any
is missing:

| Secret | What it is |
|---|---|
| `SUPABASE_DB_PASSWORD` | Password for the `postgres` role (Supabase dashboard → Settings → Database) |
| `BACKUP_PASSPHRASE` | Symmetric passphrase for `openssl enc`. **If this is lost, every backup is unrecoverable** — keep a copy in the password manager |
| `BACKUPS_REPO_TOKEN` | Fine-grained PAT with `contents: read/write` on `Oltaflock-AI/echobrief-backups` only |

```bash
gh secret set SUPABASE_DB_PASSWORD   # paste value at the prompt
gh secret set BACKUP_PASSPHRASE
gh secret set BACKUPS_REPO_TOKEN
```

### RPO / RTO in plain terms

- **RPO ≈ 24 h**: nightly dump means up to a day of meetings/insights can be
  lost. Acceptable while the dataset is ~23 MB and low-write.
- **RTO ≈ 1–2 h**: create/reset a Supabase project, apply migrations, run
  `scripts/backup/restore.sh`, re-point env vars, re-create the Vault secret,
  users re-authenticate.

### Restoring

```bash
# 1. Fetch the newest backup (any backup-YYYY-MM-DD tag)
gh release download backup-2026-08-31 \
  --repo Oltaflock-AI/echobrief-backups --pattern '*.enc'

# 2. Restore (passphrase from the password manager)
BACKUP_PASSPHRASE=... scripts/backup/restore.sh \
  echobrief-db-2026-08-31.tar.gz.enc \
  "postgresql://postgres:PW@HOST:5432/postgres"
```

The script decrypts, creates minimal `auth`/`extensions` stubs (skip with
`--no-stubs` when the target is a real Supabase project), restores
`auth.users` then `public`, and prints row counts at the end. It **refuses to
run against the production host** unless `--i-really-mean-it` is passed.

### Trusting it: the weekly restore drill

[`.github/workflows/db-restore-drill.yml`](../.github/workflows/db-restore-drill.yml)
runs every **Monday 05:30 UTC** (and on demand): downloads the newest release,
decrypts it, restores into a throwaway `postgres:17` service container, and
**fails unless** `meetings`, `transcripts`, `meeting_insights`, `profiles` and
`auth.users` all exist with row counts > 0. Check it under Actions → “DB
restore drill” — a green run is the proof the backups are actually
restorable; a red run means the backups may be decoration, treat it with
incident urgency. Some psql errors during the drill are expected (Supabase-only
roles/grants against vanilla Postgres) and are printed in full for diagnosis.

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

## Google OAuth clients

Two **separate** OAuth clients live in the Google Cloud project `Echobrief` (project number `226681308853`). They fail independently — check the right one.

| Purpose | Client | Redirect URI | Configured in |
|---|---|---|---|
| Sign in with Google | `226681308853-qpq87ckp…` | `https://lekkpfpojlspbuwrtmzt.supabase.co/auth/v1/callback` | Supabase Auth → Providers → Google |
| Calendar connect | `226681308853-7mqtgjgj…` | `https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/google-oauth-redirect` | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` secrets |

**Consent screen status (2026-08-31):** domain `echobrief.in` verified in Search Console (DNS TXT at GoDaddy), branding verified and shown to users. Publishing to Production still requires Google review because the calendar scopes (`calendar.readonly`, `calendar.events.readonly`, `calendar.events`) are *sensitive*.

### Probing a client without signing in

Deleting a client in the console does not surface anywhere in the app — the button just fails at click time. To check one is alive, request its consent page and grep the response:

```bash
CID=<client id>; RU=<its redirect uri>
curl -sL "https://accounts.google.com/o/oauth2/v2/auth?client_id=$CID&redirect_uri=$RU&response_type=code&scope=email%20profile&state=probe" \
  | grep -oiE "deleted_client|invalid_client|redirect_uri_mismatch|Access blocked|Sign in with Google"
```

`Sign in with Google` alone means healthy. `deleted_client` means the client is gone and must be recreated. This exercises the authorize step only — a wrong client **secret** fails later, at token exchange, and only a real sign-in catches it.

To read or repoint the Supabase provider (the Management API returns the secret as a sha256 digest, never the value):

```bash
TOK=$(security find-generic-password -s "Supabase CLI" -w | sed 's/^go-keyring-base64://' | base64 -d)
curl -s -H "Authorization: Bearer $TOK" \
  https://api.supabase.com/v1/projects/lekkpfpojlspbuwrtmzt/config/auth \
  | python3 -c "import json,sys;d=json.load(sys.stdin);print({k:v for k,v in d.items() if 'google' in k})"
```

Use `curl`, not Python's `urllib` — the default urllib User-Agent is Cloudflare-blocked and returns a bare `403`.

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
