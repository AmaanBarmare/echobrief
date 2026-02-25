# EchoBrief

**AI-powered meeting intelligence platform that records, transcribes, and generates decision-grade insights from your meetings — delivered instantly to Slack, email, or your dashboard.**

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Backend-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![OpenAI](https://img.shields.io/badge/OpenAI-Whisper%20%2B%20GPT-412991?logo=openai&logoColor=white)](https://openai.com)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension%20MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Supabase Edge Functions](#supabase-edge-functions)
- [Chrome Extension](#chrome-extension)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Scripts](#scripts)
- [Technical Highlights](#technical-highlights)

---

## Overview

EchoBrief solves the problem of meeting fatigue and lost context. Instead of scrambling to take notes, EchoBrief sits in the background — capturing audio from Google Meet or Zoom via a Chrome extension, transcribing it with OpenAI Whisper, and running it through a custom GPT-4o-mini pipeline that produces executive summaries, action items with ownership, risk flags, strategic insights, and timestamped timelines. Summaries are automatically delivered to Slack channels or email, and everything is searchable from a polished React dashboard.

### What makes this different from Otter.ai / Fireflies?

- **No bot joins your call** — EchoBrief uses Chrome's Tab Capture API to record audio natively from the browser tab, so there's no awkward "Notetaker Bot has joined" moment.
- **Decision-grade insights, not just transcripts** — The AI pipeline acts as a "chief of staff," producing structured reports with strategic insights, risk flags, confidence-scored action items, and speaker attribution.
- **Full-stack, self-hosted architecture** — Built on Supabase (Postgres, Edge Functions, Auth, Storage, Realtime), giving you complete ownership of your data.

---

## Key Features

| Category | Features |
|---|---|
| **Recording** | Chrome extension with auto-detection for Google Meet & Zoom, tab audio capture via Offscreen API, manual recording from web dashboard |
| **AI Transcription** | OpenAI Whisper with word-level timestamps, speaker segmentation, verbose JSON output |
| **AI Insights** | Executive summary, strategic insights, speaker-attributed highlights, prioritized action items (with owner, confidence, expected outcome), decisions & commitments, risks & blockers, chronological timeline |
| **Meeting Metrics** | Engagement score, sentiment analysis, speaker participation breakdown |
| **Integrations** | Google Calendar sync (OAuth 2.0 with token refresh), Slack delivery (channel selection), email summaries (Resend), Notion sync (OAuth) |
| **Dashboard** | Meeting list with status badges, global search, stats cards, meeting analytics chart, action item tracker, calendar view |
| **UX** | Dark/light theme, animated page transitions (Framer Motion), responsive layout, pre-meeting notifications, real-time status updates via Supabase Realtime |
| **Security** | Supabase Auth (email/password), Row Level Security on all tables, encrypted storage, CORS protection, rate limiting |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                  │
│                                                                          │
│  ┌─────────────────────┐         ┌─────────────────────────────────┐    │
│  │   Chrome Extension  │         │         React Web App           │    │
│  │   (Manifest V3)     │         │    (Vite + TypeScript + TW)     │    │
│  │                     │         │                                  │    │
│  │  • Tab Capture API  │         │  • Dashboard    • Meeting Detail│    │
│  │  • Auto-detection   │ tokens  │  • Calendar     • Action Items  │    │
│  │  • Offscreen Doc    │◄───────►│  • Settings     • Recordings    │    │
│  │  • MediaRecorder    │  sync   │  • Global Search                │    │
│  └────────┬────────────┘         └──────────┬──────────────────────┘    │
│           │ upload                           │ queries / subscriptions   │
└───────────┼──────────────────────────────────┼──────────────────────────┘
            │                                  │
            ▼                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         SUPABASE PLATFORM                               │
│                                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │   Auth   │  │ Postgres │  │ Storage  │  │ Realtime │  │  Edge    │ │
│  │          │  │   (RLS)  │  │(audio)   │  │(live     │  │Functions │ │
│  │ email/pw │  │          │  │          │  │ updates) │  │  (Deno)  │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └─────┬────┘ │
│                                                                  │      │
└──────────────────────────────────────────────────────────────────┼──────┘
                                                                   │
                    ┌──────────────────────────────────────────────┘
                    │
                    ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                                │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ OpenAI       │  │ Google       │  │ Slack    │  │ Resend       │   │
│  │ Whisper +    │  │ Calendar     │  │ API      │  │ (Email)      │   │
│  │ GPT-4o-mini  │  │ OAuth 2.0   │  │          │  │              │   │
│  └──────────────┘  └──────────────┘  └──────────┘  └──────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 18** | UI framework with concurrent features |
| **TypeScript** | Type-safe development across the entire frontend |
| **Vite** | Build tool with HMR for fast development |
| **Tailwind CSS** | Utility-first styling |
| **shadcn/ui** | 50+ accessible, composable UI components |
| **React Router v6** | Client-side routing with protected routes |
| **TanStack Query** | Server state management, caching, and real-time sync |
| **Framer Motion** | Page transitions and micro-animations |
| **date-fns** | Lightweight date manipulation |
| **Recharts** | Meeting analytics charting |

### Backend
| Technology | Purpose |
|---|---|
| **Supabase** | Backend-as-a-service (Auth, Postgres, Storage, Realtime, Edge Functions) |
| **PostgreSQL** | Relational database with Row Level Security |
| **Deno** | Runtime for Supabase Edge Functions |
| **Supabase Realtime** | WebSocket subscriptions for live meeting status updates |
| **Supabase Storage** | Private bucket for audio file storage (WebM) |

### AI / ML
| Technology | Purpose |
|---|---|
| **OpenAI Whisper** | Audio transcription with word-level timestamps and segment data |
| **GPT-4o-mini** | Meeting insight generation (structured JSON output) and speaker attribution |

### Integrations
| Integration | Implementation |
|---|---|
| **Google Calendar** | Full OAuth 2.0 flow with PKCE, token refresh, event sync |
| **Slack** | Bot token integration, Block Kit formatted messages, channel selection |
| **Email** | Resend API for formatted meeting summary emails |
| **Notion** | OAuth 2.0 flow for workspace sync |

### Chrome Extension
| Technology | Purpose |
|---|---|
| **Manifest V3** | Modern Chrome extension architecture |
| **Tab Capture API** | Native browser audio capture (no bot required) |
| **Offscreen Documents** | Background audio recording without visible windows |
| **chrome.storage** | Auth token synchronization with web app |

---

## How It Works

```
  ┌─────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
  │  RECORD  │ ──► │TRANSCRIBE│ ──► │ ANALYZE  │ ──► │ DELIVER  │
  └─────────┘      └──────────┘      └──────────┘      └──────────┘

  Chrome ext        Whisper API       GPT-4o-mini       Slack / Email
  detects Meet/     generates         produces           formatted
  Zoom, captures    transcript        decision-grade     Block Kit
  tab audio via     with word-level   insights as        messages or
  MediaRecorder     timestamps        structured JSON    HTML emails
```

**Detailed flow:**

1. **Detection** — The Chrome extension monitors browser tabs for Google Meet (`meet.google.com`) and Zoom (`*.zoom.us`) URLs, displaying a notification banner when a meeting is detected.

2. **Recording** — User clicks "Start Recording" in the extension popup. The extension requests `tabCapture` permission, creates an Offscreen Document, and begins recording via `MediaRecorder` API — capturing all tab audio without any bot joining the call.

3. **Upload** — When recording stops, the audio (WebM) is uploaded to Supabase Storage via the `upload-recording` Edge Function, which creates a meeting record and triggers processing.

4. **Transcription** — The `process-meeting` Edge Function downloads the audio, sends it to OpenAI Whisper (`whisper-1`) with `verbose_json` response format, yielding a full transcript with word-level timestamps and segments.

5. **Speaker Attribution** — If meeting attendees are known (via calendar sync), GPT-4o-mini analyzes transcript segments against the participant list to attribute speakers with confidence levels.

6. **Insight Generation** — The speaker-labeled transcript is fed into a carefully engineered GPT-4o-mini prompt that produces a structured JSON report: executive summary, strategic insights, action items (with owner, priority, confidence, expected outcome), decisions, risks, timeline entries, and meeting metrics.

7. **Delivery** — Insights are saved to the database and optionally delivered to a Slack channel (using Block Kit for rich formatting) and/or emailed via Resend. The dashboard updates in real-time via Supabase Realtime subscriptions.

---

## Project Structure

```
echobrief/
├── src/
│   ├── components/
│   │   ├── dashboard/                # Dashboard UI (14 components)
│   │   │   ├── DashboardLayout.tsx   # Sidebar + header shell
│   │   │   ├── RecordingButton.tsx   # Start/stop recording control
│   │   │   ├── GlobalRecordingPanel  # Floating active recording panel
│   │   │   ├── ExtensionStatus.tsx   # Chrome extension status indicator
│   │   │   ├── MeetingCard.tsx       # Meeting list item with actions
│   │   │   ├── MeetingStatusBadge    # Processing/completed/failed badges
│   │   │   ├── SlackDeliverySelector # Slack channel picker
│   │   │   ├── PreMeetingNotification# Upcoming meeting alerts
│   │   │   ├── StatsCards.tsx        # Key metrics cards
│   │   │   ├── MeetingsChart.tsx     # Recharts analytics chart
│   │   │   ├── GlobalSearch.tsx      # Search across meetings
│   │   │   ├── Header.tsx           # Top bar with search + user menu
│   │   │   ├── Sidebar.tsx          # Navigation sidebar
│   │   │   └── PageTransition.tsx   # Framer Motion page wrapper
│   │   ├── landing/                  # Public landing page (6 components)
│   │   │   ├── Navbar.tsx / Hero.tsx / Features.tsx
│   │   │   ├── HowItWorks.tsx / CTA.tsx / Footer.tsx
│   │   ├── meeting/                  # Meeting detail views
│   │   │   ├── MeetingTabs.tsx      # Summary / Transcript / Action Items / Timeline
│   │   │   ├── TimelineView.tsx     # Chronological event timeline
│   │   │   └── MeetingMetrics.tsx   # Engagement, sentiment, participation
│   │   └── ui/                       # 50+ shadcn/ui components
│   ├── contexts/
│   │   ├── AuthContext.tsx           # Session management, sign in/up/out
│   │   ├── RecordingContext.tsx      # Recording state machine
│   │   └── ThemeContext.tsx          # Dark/light theme toggle
│   ├── hooks/
│   │   ├── useAudioRecorder.ts      # Browser MediaRecorder abstraction
│   │   ├── useActionItemCompletions # Action item completion tracking
│   │   ├── useToast.ts             # Toast notification hook
│   │   └── use-mobile.tsx          # Responsive breakpoint detection
│   ├── integrations/supabase/
│   │   ├── client.ts               # Supabase client singleton
│   │   └── types.ts                # Auto-generated database types
│   ├── pages/                       # Route-level page components
│   │   ├── Landing.tsx / Auth.tsx / Dashboard.tsx
│   │   ├── MeetingDetail.tsx / Recordings.tsx
│   │   ├── Settings.tsx / Calendar.tsx / ActionItems.tsx
│   │   └── NotFound.tsx / Index.tsx
│   └── types/meeting.ts             # Shared TypeScript interfaces
├── chrome-extension/
│   ├── manifest.json                # MV3 manifest with permissions
│   ├── background.js                # Service worker (tab detection, capture, upload)
│   ├── content.js                   # Injected script (recording banner UI)
│   ├── popup.html / popup.js        # Extension popup (auth, controls, status)
│   ├── offscreen.html / offscreen.js# Offscreen document for MediaRecorder
│   └── icons/                       # Extension icons (16, 48, 128px)
├── supabase/
│   ├── functions/                   # 14 Deno Edge Functions
│   │   ├── process-meeting/         # Core AI pipeline
│   │   ├── upload-recording/        # Audio upload handler
│   │   ├── google-oauth-start/      # OAuth initiation
│   │   ├── google-oauth-callback/   # OAuth token exchange
│   │   ├── google-oauth-redirect/   # Post-auth redirect
│   │   ├── disconnect-google/       # Revoke Google connection
│   │   ├── get-google-client-id/    # Client ID for frontend
│   │   ├── sync-google-calendar/    # Calendar event sync
│   │   ├── notion-oauth-start/      # Notion OAuth
│   │   ├── notion-oauth-callback/   # Notion token exchange
│   │   ├── sync-notion/             # Notion data sync
│   │   ├── send-slack-message/      # Slack Block Kit delivery
│   │   ├── test-slack-connection/   # Slack health check
│   │   ├── send-meeting-email/      # Email via Resend
│   │   └── _shared/                 # CORS headers, rate limiting
│   ├── migrations/                  # 15 SQL migrations
│   └── config.toml                  # Supabase project config
├── public/                          # Static assets (logo, favicon)
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── eslint.config.js
```

---

## Database Schema

```sql
-- Core tables
profiles              -- User profiles, integration flags, preferences
meetings              -- Meeting metadata (title, source, times, status, audio_url, attendees)
transcripts           -- Full transcript, speaker segments, word-level timestamps
meeting_insights      -- AI output (summary, action_items, decisions, risks, timeline, metrics)
action_item_completions -- Tracks completed action items per user

-- Integration tables
user_oauth_tokens     -- Google OAuth access/refresh tokens with expiry
google_oauth_states   -- CSRF protection for OAuth flow
notion_connections    -- Notion workspace and database IDs
slack_messages        -- Slack delivery log (channel, status, message_ts, errors)
meeting_notifications -- Pre-meeting notification schedule and status
```

### Entity Relationship

```
profiles ──────────┐
   │                │
   │ 1:N            │ 1:1
   ▼                ▼
meetings       user_oauth_tokens
   │
   ├── 1:1 ──► transcripts
   │
   ├── 1:1 ──► meeting_insights
   │
   ├── 1:N ──► slack_messages
   │
   ├── 1:N ──► meeting_notifications
   │
   └── 1:N ──► action_item_completions
```

All tables have **Row Level Security** enabled, restricting access so users can only read and modify their own data.

---

## Supabase Edge Functions

| Function | Method | Description |
|---|---|---|
| `upload-recording` | POST | Validates auth, uploads audio to Storage, creates meeting record, returns meeting ID |
| `process-meeting` | POST | Downloads audio → Whisper transcription → GPT-4o-mini speaker attribution → GPT-4o-mini insight generation → saves transcript + insights → triggers Slack/email delivery |
| `google-oauth-start` | GET | Generates OAuth state, stores in DB, redirects to Google consent screen |
| `google-oauth-callback` | GET | Exchanges auth code for tokens, stores encrypted tokens, redirects to app |
| `google-oauth-redirect` | GET | Final redirect after OAuth completion |
| `disconnect-google` | POST | Removes stored tokens, updates profile flags |
| `get-google-client-id` | GET | Returns Google client ID for frontend OAuth buttons |
| `sync-google-calendar` | POST | Fetches upcoming events via Google Calendar API (with automatic token refresh), upserts to meetings table. Includes rate limiting. |
| `send-slack-message` | POST | Sends meeting summary to specified Slack channel using Block Kit formatted messages |
| `test-slack-connection` | POST | Validates Slack bot token and channel access |
| `send-meeting-email` | POST | Sends formatted HTML meeting summary via Resend |
| `notion-oauth-start` | GET | Initiates Notion OAuth 2.0 flow |
| `notion-oauth-callback` | GET | Exchanges Notion auth code for access token |
| `sync-notion` | POST | Syncs meeting data to connected Notion database |

---

## Chrome Extension

### Manifest V3 Permissions

```json
{
  "permissions": ["activeTab", "tabCapture", "storage", "tabs", "scripting", "offscreen"],
  "host_permissions": ["https://meet.google.com/*", "https://*.zoom.us/*"]
}
```

### Architecture

```
┌──────────────┐    messages     ┌──────────────┐    chrome.storage    ┌──────────┐
│  content.js  │ ◄────────────► │ background.js│ ◄──────────────────► │ popup.js │
│              │                │(service worker)│                     │          │
│ • Banner UI  │                │ • Tab detect   │                     │ • Login  │
│ • Status     │                │ • Tab capture  │                     │ • Status │
│ • Listeners  │                │ • Upload       │                     │ • Controls│
└──────────────┘                └───────┬────────┘                     └──────────┘
                                        │
                                        │ stream
                                        ▼
                                ┌──────────────┐
                                │ offscreen.js │
                                │              │
                                │ • MediaRec.  │
                                │ • Audio buf  │
                                │ • WebM out   │
                                └──────────────┘
```

**Key implementation details:**

- **Tab Capture API** — Records tab audio without joining the meeting as a bot participant. No meeting attendee sees any notification of recording.
- **Offscreen Document** — Required by Manifest V3 since service workers can't access DOM APIs. The offscreen document runs `MediaRecorder` to encode the captured audio stream as WebM.
- **Token Sync** — The web app writes the Supabase auth token to `chrome.storage.local`. The extension reads this token to authenticate uploads, avoiding a separate login flow.
- **Auto-detection** — The background service worker listens for tab updates and injects `content.js` when Meet/Zoom URLs are detected.

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local development)
- Chrome browser (for extension)

### 1. Clone and Install

```bash
git clone https://github.com/yourusername/echobrief.git
cd echobrief
npm install
```

### 2. Environment Setup

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
VITE_SUPABASE_PROJECT_ID=your-project-id
```

For Edge Functions, create `supabase/.env.local`:

```env
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
SLACK_BOT_TOKEN=xoxb-...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### 3. Run the Web App

```bash
npm run dev
```

The app starts at `http://localhost:8080`.

### 4. Load the Chrome Extension

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `chrome-extension/` directory
5. Log in on the web app — the extension automatically syncs your session

### 5. Run Supabase Locally (Optional)

```bash
supabase start
supabase db push
npm run functions:serve
```

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | `.env` | Supabase project URL (frontend) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | `.env` | Supabase anon key (frontend) |
| `VITE_SUPABASE_PROJECT_ID` | `.env` | Supabase project ID |
| `OPENAI_API_KEY` | `supabase/.env.local` | Whisper transcription + GPT insights |
| `RESEND_API_KEY` | `supabase/.env.local` | Email delivery |
| `SLACK_BOT_TOKEN` | `supabase/.env.local` | Slack message posting |
| `GOOGLE_CLIENT_ID` | `supabase/.env.local` | Google Calendar OAuth |
| `GOOGLE_CLIENT_SECRET` | `supabase/.env.local` | Google Calendar OAuth |
| `SUPABASE_URL` | Auto-injected | Available in Edge Functions |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto-injected | Available in Edge Functions |

---

## Scripts

| Script | Command | Description |
|---|---|---|
| `npm run dev` | `vite` | Start development server with HMR |
| `npm run build` | `vite build` | Production build |
| `npm run build:dev` | `vite build --mode development` | Development build |
| `npm run preview` | `vite preview` | Preview production build locally |
| `npm run lint` | `eslint .` | Run ESLint |
| `npm run functions:serve` | `supabase functions serve --env-file ./supabase/.env.local` | Serve Edge Functions locally |

---

## Technical Highlights

### AI Pipeline Design

The `process-meeting` Edge Function implements a multi-stage AI pipeline:

1. **Transcription** — Whisper API with `verbose_json` response format returns segment-level and word-level timestamps, enabling timeline reconstruction.
2. **Speaker Attribution** — A separate GPT-4o-mini call analyzes transcript segments against known attendees, returning attributions with confidence levels (`high` / `medium` / `low`). Low-confidence attributions are discarded.
3. **Insight Generation** — A carefully engineered system prompt instructs GPT-4o-mini to act as an "intelligent chief of staff," producing a structured JSON report with strict accuracy rules (no invented insights, no speculative ownership, prefer "Open Question" over guessing). The prompt enforces JSON schema compliance via `response_format: { type: "json_object" }`.

### Real-Time Architecture

The dashboard uses **Supabase Realtime** WebSocket subscriptions to reflect meeting status changes (recording → processing → completed) without polling. When the `process-meeting` function updates a meeting's status, the dashboard instantly updates the `MeetingStatusBadge` and makes insights available.

### Chrome Extension: Offscreen Document Pattern

Manifest V3 service workers can't access DOM APIs like `MediaRecorder`. EchoBrief solves this with the **Offscreen Document** pattern:

- `background.js` calls `chrome.offscreen.createDocument()` when recording starts
- `offscreen.js` receives the audio stream and runs `MediaRecorder`
- Encoded WebM chunks are accumulated in memory
- On stop, the complete blob is sent back to the service worker for upload

### Security Model

- **Row Level Security** — Every database table has RLS policies ensuring users can only access their own meetings, transcripts, insights, and integration data.
- **OAuth State Validation** — Google Calendar OAuth uses server-generated state tokens stored in the database, validated on callback to prevent CSRF attacks.
- **Token Isolation** — OAuth tokens are stored server-side and accessed only via service role key in Edge Functions. The frontend never handles refresh tokens.
- **Rate Limiting** — Calendar sync includes rate limiting to prevent abuse of the Google Calendar API.

### State Management

- **Server state** is managed via TanStack Query with optimistic updates and automatic cache invalidation.
- **Client state** uses React Context for cross-cutting concerns (auth session, recording state, theme).
- **Extension state** syncs via `chrome.storage.local`, bridging the web app and extension without requiring a separate auth flow.

---

## License

This project is for portfolio/demonstration purposes.
