# EchoBrief - Project Snapshot (April 2, 2026)

This file captures the current state of the EchoBrief project as a reference starting point.

---

## What is EchoBrief?

EchoBrief is an AI-powered meeting recorder and summarizer. It consists of:

1. **Web App** - A React (Vite + TypeScript + Tailwind + shadcn/ui) dashboard deployed on **Vercel** at `echobrief-ten.vercel.app`
2. **Chrome Extension** (v1.0.3) - Records audio from Google Meet and Zoom Web meetings, published on the Chrome Web Store
3. **Supabase Backend** - Auth, database, storage (recordings bucket), and 16 Edge Functions

---

## Current Version

- **App version:** 1.0.0 (package.json)
- **Chrome Extension version:** 1.0.3 (manifest.json)
- **Latest commit:** `13be0fc` "1.0.3" (March 20, 2026) by Amaan Barmare
- **Total commits:** 92
- **Branch:** `main` (only branch)
- **Remote:** `https://github.com/Oltaflock-AI/echobrief.git`
- **Working tree:** Clean (no uncommitted changes)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS 3, shadcn/ui (Radix) |
| Routing | react-router-dom v6 |
| State/Data | TanStack React Query, React Context (Auth, Recording, Theme) |
| Backend | Supabase (Auth, Postgres, Storage, Edge Functions via Deno) |
| AI/STT | OpenAI Whisper (primary), Sarvam AI (secondary/async STT) |
| Integrations | Google Calendar (OAuth), Slack (bot token), Notion (OAuth), Email (Resend) |
| Hosting | Vercel (web app), Supabase (backend), Chrome Web Store (extension) |

---

## Project Structure

```
echobrief/
├── src/                          # React web app source
│   ├── App.tsx                   # Root component, all routes defined here
│   ├── main.tsx                  # Entry point
│   ├── index.css                 # Global styles
│   ├── pages/                    # Route pages
│   │   ├── Landing.tsx           # Public landing page (/)
│   │   ├── Auth.tsx              # Login/signup (/auth)
│   │   ├── Dashboard.tsx         # Main dashboard (/dashboard)
│   │   ├── Recordings.tsx        # Recordings list (/recordings)
│   │   ├── MeetingDetail.tsx     # Single meeting view (/meeting/:id)
│   │   ├── Settings.tsx          # User settings, integrations (/settings)
│   │   ├── Calendar.tsx          # Calendar view (/calendar)
│   │   ├── ActionItems.tsx       # Action items (/action-items)
│   │   ├── ChromeExtensionGuide.tsx  # Extension setup guide
│   │   └── PrivacyPolicy.tsx     # Privacy policy page
│   ├── components/
│   │   ├── dashboard/            # Dashboard-specific components
│   │   │   ├── DashboardLayout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   ├── GlobalRecordingPanel.tsx
│   │   │   ├── PreMeetingNotification.tsx
│   │   │   ├── ExtensionStatus.tsx
│   │   │   ├── MeetingCard.tsx
│   │   │   ├── RecordingButton.tsx
│   │   │   ├── SlackDeliverySelector.tsx
│   │   │   ├── StatsCards.tsx
│   │   │   ├── MeetingsChart.tsx
│   │   │   └── GlobalSearch.tsx
│   │   ├── landing/              # Landing page sections
│   │   │   ├── Navbar.tsx, Hero.tsx, Features.tsx
│   │   │   ├── HowItWorks.tsx, CTA.tsx, Footer.tsx
│   │   ├── meeting/              # Meeting detail components
│   │   │   ├── MeetingMetrics.tsx
│   │   │   ├── MeetingTabs.tsx
│   │   │   └── TimelineView.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── ExtensionTokenSync.tsx
│   │   ├── NavLink.tsx
│   │   └── ui/                   # shadcn/ui components
│   ├── contexts/
│   │   ├── AuthContext.tsx        # Supabase auth state
│   │   ├── RecordingContext.tsx   # In-browser recording state (MediaRecorder)
│   │   └── ThemeContext.tsx       # Dark/light theme
│   ├── hooks/
│   │   ├── useAudioRecorder.ts
│   │   ├── useActionItemCompletions.ts
│   │   ├── use-toast.ts
│   │   └── use-mobile.tsx
│   ├── integrations/supabase/    # Supabase client setup
│   ├── lib/                      # Utility functions
│   └── types/                    # TypeScript types
│
├── chrome-extension/             # Chrome Extension (Manifest V3)
│   ├── manifest.json             # Extension manifest v3
│   ├── background.js             # Service worker
│   ├── content.js                # Injected into Meet/Zoom pages
│   ├── offscreen.js              # Offscreen document for recording
│   ├── popup.html / popup.js     # Extension popup UI
│   ├── web-bridge.js             # Bridge between extension and web app
│   ├── mic-permission.html/js    # Mic permission request page
│   └── icons/                    # Extension icons
│
├── supabase/
│   ├── config.toml               # Project config (project_id: qjhysesjocanowmdkeme)
│   ├── functions/                # 16 Deno Edge Functions
│   │   ├── _shared/              # Shared utilities (cors, sarvam, insights)
│   │   ├── process-meeting/      # Core: transcribe + generate insights
│   │   ├── upload-recording/     # Handle audio upload from extension
│   │   ├── sarvam-webhook/       # Sarvam AI async STT callback
│   │   ├── google-oauth-start/   # Google OAuth flow (start)
│   │   ├── google-oauth-callback/# Google OAuth flow (callback)
│   │   ├── google-oauth-redirect/# Google OAuth flow (redirect)
│   │   ├── get-google-client-id/ # Return Google client ID
│   │   ├── disconnect-google/    # Disconnect Google account
│   │   ├── sync-google-calendar/ # Sync Google Calendar events
│   │   ├── send-slack-message/   # Post meeting summary to Slack
│   │   ├── test-slack-connection/# Test Slack bot connection
│   │   ├── notion-oauth-start/   # Notion OAuth flow (start)
│   │   ├── notion-oauth-callback/# Notion OAuth flow (callback)
│   │   ├── sync-notion/          # Sync meetings to Notion
│   │   ├── send-meeting-email/   # Email meeting summary via Resend
│   │   └── (all have verify_jwt = false in config.toml)
│   └── migrations/               # 16 SQL migrations (Jan 8 - Mar 14, 2026)
│       └── Latest: sarvam_migration.sql (added sarvam_job_id, stt_provider columns)
│
├── public/                       # Static assets
├── docs/                         # Documentation
├── .env                          # Environment variables (COMMITTED - see security note)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── vercel.json                   # SPA rewrite rule
└── echobrief-extension.zip       # Pre-built extension package
```

---

## Database Schema (key tables inferred from migrations & code)

- **profiles** - User profiles (full_name, email, google_calendar_connected, slack_connected, slack_channel_id, slack_channel_name)
- **meetings** - Meeting records (audio_url, attendees, sarvam_job_id, processing_config)
- **transcripts** - Transcription results (language_detected, stt_provider: 'whisper' or 'sarvam')
- **Storage bucket:** `recordings` (private, per-user folder isolation via RLS)

---

## Core Flow

1. **Record**: Chrome extension detects Google Meet / Zoom Web, captures tab audio via `tabCapture` + offscreen document
2. **Upload**: Extension uploads audio blob to Supabase Storage via `upload-recording` edge function
3. **Process**: `process-meeting` edge function transcribes audio (OpenAI Whisper or Sarvam AI), generates insights (summary, action items, key topics)
4. **Deliver**: Results are saved to DB and optionally sent to Slack, email, or Notion
5. **View**: Web dashboard shows meetings, transcripts, action items, calendar integration

---

## Integrations Status

| Integration | Status | Details |
|-------------|--------|---------|
| Google Calendar | Done | Full OAuth flow, calendar sync, pre-meeting notifications |
| Slack | Done | Bot token posting, channel selection, test connection |
| Notion | Exists | OAuth flow + sync function created |
| Email (Resend) | Done | Meeting summary emails |
| Sarvam AI STT | Done | Async batch transcription with webhook callback |
| OpenAI Whisper | Done | Primary synchronous STT |

---

## Key Commit Timeline

| Date | Commit | Milestone |
|------|--------|-----------|
| Jan 22, 2026 | `bebc3a2` | Initial template (Vite + React + shadcn) |
| Jan 22, 2026 | `1e3cb77` | Chrome extension wired and working |
| Feb 6, 2026 | `550e46a` | Lovable AI updates |
| Feb 22, 2026 | `372c646` | Supabase setup done, web app connected |
| Feb 22, 2026 | `ad45bde` | Upload recording edge function |
| Feb 24, 2026 | `f2b8a7b` | End-to-end tested |
| Feb 27, 2026 | `0e52d20` | Version 1.0 ready |
| Feb 28, 2026 | `160c71c` | Full build |
| Mar 4, 2026 | `e05e871` | Extension published to Chrome Web Store |
| Mar 11, 2026 | `a750b51` | Em dashes removed (text formatting fix) |
| Mar 14, 2026 | `c210d5a` | Sarvam AI + calendar integration done |
| Mar 14, 2026 | `3b4f756` | Version 1.0.2 |
| Mar 20, 2026 | `009558a` | Memory problem solved |
| Mar 20, 2026 | `13be0fc` | Version 1.0.3 (LATEST) |

---

## Recent Changes (last 5 commits)

The last batch of changes (v1.0.2 to v1.0.3) focused on:
- **Sarvam AI integration** - Added async batch STT as alternative to Whisper (`_shared/sarvam.ts`, `sarvam-webhook/index.ts`, Sarvam migration)
- **Insights extraction refactor** - Moved insight generation to `_shared/insights.ts` (458 new lines), simplified `process-meeting/index.ts`
- **Chrome Extension updates** - Added `web-bridge.js` for extension-to-webapp communication, updated recording flow
- **Chrome Extension Guide page** - New page at `/chrome-extension-guide`
- **Calendar pre-meeting notification** - `PreMeetingNotification` component (notifies 5 min before meetings)
- **Memory problem fix** - Commit `009558a` (last functional change)

---

## Environment / Services

- **Supabase Project ID:** `qjhysesjocanowmdkeme`
- **Supabase URL:** `https://qjhysesjocanowmdkeme.supabase.co`
- **Vercel deployment:** `echobrief-ten.vercel.app`
- **Chrome Web Store:** Published at the URL in .env (`VITE_CHROME_EXTENSION_STORE_URL`)
- **Google OAuth Client ID:** Configured (358212690603-...)

---

## Security Note

The `.env` file is currently **committed to git** (even though `.gitignore` lists `.env`). It was likely added before the gitignore rule. It contains:
- Supabase anon key and (commented out) service role key
- OpenAI API key
- Resend API key
- Slack bot token
- Sarvam API key + webhook secret
- Google client ID + secret

**Action needed:** These keys should be rotated and the `.env` file should be removed from git history.

---

## All Edge Functions have `verify_jwt = false`

Every Supabase edge function in `config.toml` has JWT verification disabled. This means they are publicly callable without authentication. This was likely done for convenience during development but should be reviewed before production hardening.

---

## Known Context

- The project was initially scaffolded with **Lovable AI** (gpt-engineer-app bot commits visible in early history)
- Development has been primarily by Amaan Barmare since Feb 22, 2026
- The notetaker is branded as "Khush's Notetaker" in `PreMeetingNotification` (hardcoded in App.tsx line 106)
- The app supports both in-browser recording (via RecordingContext/MediaRecorder) and Chrome extension recording
