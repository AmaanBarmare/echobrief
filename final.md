# EchoBrief - Changes Since Initial Snapshot (April 2, 2026)

This file documents everything that changed between the initial snapshot (`13be0fc` — v1.0.3, March 20, 2026) and the current HEAD (`378443d`). **125 new commits** were added, totaling **~17,900 lines added** and **~3,000 lines modified/removed** across **116 files**.

---

## Summary of What Changed

The project went from a basic meeting recorder/summarizer (Chrome extension + Supabase + Whisper) to a **full-featured AI meeting platform** with bot-based recording, multi-platform support, onboarding flows, digest reports, and a completely redesigned UI.

---

## 1. New Feature: Playwright Bot Service (`bot-service/`)

A brand-new standalone microservice was added for **headless browser-based meeting recording** — replacing the Chrome extension as the primary recording method for supported platforms.

**New files (entire directory):**
- `bot-service/` — Node.js + TypeScript + Playwright + Docker
  - `src/adapters/google-meet.ts` — Google Meet bot adapter
  - `src/adapters/teams.ts` — Microsoft Teams bot adapter
  - `src/adapters/zoom.ts` — Zoom bot adapter
  - `src/adapters/base.ts` — Base adapter interface
  - `src/services/orchestrator.ts` — Bot lifecycle management (332 lines)
  - `src/services/audio-capture.ts` — Audio capture via PulseAudio
  - `src/services/transcription.ts` — Real-time transcription service
  - `src/services/supabase.ts` — Supabase integration for bot service
  - `src/routes/bot.ts` — REST API routes for bot control
  - `src/index.ts` — Express server entry point
  - `Dockerfile` + `docker-compose.yml` — Containerized deployment
  - `docker-entrypoint.sh` — Startup script

**What it does:** A bot joins meetings on Google Meet, Zoom, and Microsoft Teams via Playwright, captures audio, transcribes in real-time, and pushes results to Supabase.

---

## 2. New Feature: Recall.ai Integration

Added integration with **Recall.ai** as an alternative bot-based recording service.

**New files:**
- `src/services/recall.ts` — Recall API client (create bot, get status, get transcript)
- `supabase/functions/start-recall-recording/index.ts` — Edge function to start a Recall bot
- `supabase/functions/recall-webhook/index.ts` — Webhook handler for Recall events
- `supabase/functions/start-bot/index.ts` — Generic bot start function
- `supabase/migrations/20260402_recall_integration.sql` — DB schema for recall bots
- `RECALL_INTEGRATION.md` — Integration documentation
- `test-recall-integration.sh` — Test script

**Modified:**
- `src/components/dashboard/RecordingButton.tsx` — Added bot-mode recording option
- `src/components/dashboard/RecordingPreferences.tsx` — New component for choosing recording mode

---

## 3. New Feature: Onboarding Flow

**New files:**
- `src/pages/Onboarding.tsx` — Multi-step first-time user onboarding (496 lines)
- `supabase/functions/queue-onboarding-emails/index.ts` — Queue 5-email onboarding series
- `supabase/functions/send-scheduled-emails/index.ts` — Send scheduled onboarding emails (286 lines)
- `supabase/migrations/20260402_onboarding_tracking.sql` — Track onboarding state

**What it does:** New users get a guided setup wizard + a 5-email drip campaign over 14 days.

---

## 4. New Feature: Digest Reports (Weekly/Monthly)

**New files:**
- `src/components/dashboard/DigestSettings.tsx` — UI for configuring digest preferences (281 lines)
- `supabase/functions/generate-digest-report/index.ts` — Generate digest reports (334 lines)
- `supabase/migrations/20260402_digest_reports.sql` — Digest tables (schedule, history)

**What it does:** Users can opt into weekly or monthly summary digests of their meeting activity.

---

## 5. New Feature: Email Report Delivery

**New files:**
- `src/components/dashboard/EmailReportSelector.tsx` — UI for email delivery settings
- `supabase/functions/send-email-report/index.ts` — Send formatted email reports (258 lines)
- `supabase/functions/send-meeting-summary-email/index.ts` — Individual meeting email summaries
- `supabase/functions/generate-meeting-summary/index.ts` — Generate meeting summaries
- `supabase/migrations/20260402_email_delivery_tracking.sql` — Track email delivery

---

## 6. New Feature: WhatsApp Delivery

**New files:**
- `src/components/dashboard/WhatsAppDeliverySelector.tsx` — WhatsApp delivery settings UI
- `supabase/functions/send-whatsapp-report/index.ts` — Send reports via WhatsApp (212 lines)
- `TESTING.md` — Testing documentation for WhatsApp + other integrations

---

## 7. New Feature: Meeting Insight Generation Pipeline

**New files:**
- `supabase/functions/generate-meeting-insights/index.ts` — AI insight generation from transcripts (235 lines)

**What it does:** After a bot records and transcribes a meeting, this function generates structured insights (summary, action items, key topics, sentiment analysis).

---

## 8. New Feature: Multi-Calendar Support

**New files:**
- `src/components/dashboard/CalendarSelector.tsx` — UI for selecting multiple calendars (220 lines)
- `src/contexts/CalendarContext.tsx` — Calendar state context
- `src/pages/CalendarPolished.tsx` — Redesigned calendar page (424 lines)
- `supabase/functions/sync-calendars/index.ts` — Sync multiple Google Calendars (268 lines)
- `supabase/functions/sync-calendar-events/index.ts` — Sync events for selected calendars
- `supabase/functions/fetch-calendar-events/index.ts` — Fetch events from Google API
- `supabase/functions/fetch-google-calendars/index.ts` — Fetch user's calendar list
- `supabase/functions/get-user-calendars/index.ts` — Return user's connected calendars
- `supabase/functions/auto-join-meetings/index.ts` — Auto-join upcoming meetings with bot
- `supabase/migrations/20260402_multi_calendar_support.sql` — Multi-calendar schema
- `supabase/migrations/20260402_google_oauth_states.sql` — OAuth state tracking

---

## 9. New Feature: Bot Customization

**New files:**
- `src/components/dashboard/BotCustomization.tsx` — Customize notetaker name + icon color (231 lines)

**What it does:** Users can set a custom name and color for their meeting bot (e.g., "Amaan's Notetaker" with a blue icon).

---

## 10. New Feature: Meeting Detail Modal

**New files:**
- `src/components/dashboard/MeetingDetailModal.tsx` — Rich meeting detail overlay (500 lines)

**What it does:** Click any meeting card to see full transcript, summary, action items, and attendees in a modal without leaving the page.

---

## 11. Auth Overhaul

**Modified:** `src/pages/Auth.tsx` (+497 lines), `src/contexts/AuthContext.tsx`, `src/App.tsx`

**What changed:**
- Email verification required on signup with "check your email" screen
- Forgot password + reset password flow (full round-trip)
- Change password from Settings
- Recovery hash interception at app level (prevents dashboard redirect race)
- Removed email domain restriction on signup
- 5-second timeout on `getSession()` to prevent infinite auth spinner

---

## 12. Landing Page Redesign

**Modified:** All landing components completely rewritten

- `src/components/landing/Hero.tsx` — India-first positioning, orange/amber theme
- `src/components/landing/Features.tsx` — New feature cards
- `src/components/landing/HowItWorks.tsx` — Redesigned flow
- `src/components/landing/Navbar.tsx` — New nav with brand logo
- `src/components/landing/CTA.tsx` — New CTA section
- `src/components/landing/Footer.tsx` — Redesigned footer
- **New:** `src/components/landing/Languages.tsx` — 22 Indian language support showcase

---

## 13. Dashboard Redesign

**Modified:** `src/pages/Dashboard.tsx` (+539 lines major rewrite)

- Welcome message with user's name
- Stats row (total meetings, hours saved, action items)
- Time saved banner
- Meeting list with proper cards
- Multiple rounds of loading state fixes (infinite spinner bugs)
- Pixel-perfect matching to design prototype

---

## 14. Settings Page Overhaul

**Modified:** `src/pages/Settings.tsx` (complete rewrite, ~1000 lines)

- Tab-based organization: Account, Recording, Integrations, Notifications
- Auto-join settings: notetaker name, join timing, language, platform support
- Multiple Google Calendar management with delete/disconnect
- Lucide-react icons replacing custom SVGs
- Change password section
- Delete account with confirmation

---

## 15. Branding & Theme

**New files:**
- `BRAND.md` — Brand guidelines document
- `BRAND_GUIDELINES.pdf` — Visual brand guidelines
- `public/favicon.svg` — New gradient favicon with white ripples
- `public/echobrief-logo-light.svg` — Light mode logo
- `src/assets/echobrief-icon.svg` — Brand icon
- `src/assets/echobrief-logo-light.svg` — Logo asset
- `src/components/ui/Logo.tsx` — Reusable logo component
- `src/lib/theme.ts` — Theme utilities

**Changed:**
- Default theme switched to **dark mode**
- Orange/amber color scheme throughout
- `src/index.css` — Major CSS overhaul (+191 lines)
- `tailwind.config.ts` — Updated theme configuration
- `index.html` — Updated title/metadata

---

## 16. New Pages

| Page | File | Purpose |
|------|------|---------|
| Onboarding | `src/pages/Onboarding.tsx` | First-time user setup wizard |
| Terms | `src/pages/Terms.tsx` | Terms of service |
| Docs | `src/pages/Docs.tsx` | Documentation/help page |
| Calendar (Polished) | `src/pages/CalendarPolished.tsx` | Redesigned calendar view |

---

## 17. Infrastructure & Migration Changes

**New Supabase project migration:**
- `supabase/full_migration.sql` — Combined migration for new Supabase project (777 lines)
- All chrome extension references updated to new Supabase project
- Domain migrated: all references now point to `echobrief.in`
- Email sending domain: `echobrief.in` (verified)
- CORS updated to include `echobrief-ai.vercel.app`

**New database migrations (6):**
- `20260402_recall_integration.sql` — Recall bot tracking
- `20260402_multi_calendar_support.sql` — Multi-calendar schema
- `20260402_google_oauth_states.sql` — OAuth state management
- `20260402_digest_reports.sql` — Digest report configuration + history
- `20260402_email_delivery_tracking.sql` — Email delivery logs
- `20260402_onboarding_tracking.sql` — Onboarding progress
- `v2_bot_schema.sql` — Bot service schema (85 lines)

**New edge functions (17):**
- `auto-join-meetings`, `fetch-calendar-events`, `fetch-google-calendars`
- `generate-digest-report`, `generate-meeting-insights`, `generate-meeting-summary`
- `get-user-calendars`, `queue-onboarding-emails`, `recall-webhook`
- `send-email-report`, `send-meeting-summary-email`, `send-scheduled-emails`
- `send-whatsapp-report`, `start-bot`, `start-recall-recording`
- `sync-calendar-events`, `sync-calendars`

---

## 18. Bug Fixes & Polish

- **Recordings page infinite hang** — Supabase query causing infinite loading; fixed with timeouts and simplified queries (8+ commits dedicated to this)
- **Calendar infinite loading** — Fixed state persistence, date grouping, sync button
- **Auth spinner stuck** — Added 5-second timeout to `getSession()`
- **Google OAuth flow** — Multiple fixes for calendar sync after OAuth connection
- **Meeting attendees** — Robust `extractAttendees` helper, Google Calendar API now includes attendees + organizer
- **Meeting URL extraction** — Comprehensive check with graceful fallback
- **Recovery hash race condition** — Synchronous check before render prevents dashboard redirect
- **Profile dropdown** — Moved from sidebar to header with `useRef` + outside click detection
- **DashboardLayout** — Removed temporarily during debugging, then restored
- **Theme-aware CSS** — Replaced inline dark mode overrides with proper CSS classes
- **Anti-spam safeguards** — Added to onboarding emails

---

## 19. Documentation

**New files:**
- `.env.example` — Environment variable template (previously missing)
- `ECHOBRIEF_CONTEXT.md` — Development reference guide (284 lines)
- `RECALL_INTEGRATION.md` — Recall.ai integration docs
- `TESTING.md` — Testing procedures
- `docs/v2-buildplan.pdf` — V2 build plan document
- `bot-service/README.md` — Bot service documentation

**Modified:**
- `README.md` — Major rewrite with comprehensive documentation

---

## 20. Chrome Extension Updates

**Modified files:**
- `chrome-extension/manifest.json` — Version bump
- `chrome-extension/background.js` — Updated Supabase URL
- `chrome-extension/offscreen.js` — Updated Supabase URL
- `chrome-extension/popup.html` — Updated Supabase URL
- `chrome-extension/popup.js` — Updated Supabase URL

**What changed:** All extension files updated to point to the new Supabase project.

---

## File Count Summary

| Category | Count |
|----------|-------|
| New files added | 75 |
| Existing files modified | 41 |
| Total files changed | 116 |
| New Supabase edge functions | 17 |
| New database migrations | 7 |
| New React components | 10 |
| New pages | 4 |

---

## Commits by Category

| Category | Approx. Commits |
|----------|----------------|
| New features | ~40 |
| Bug fixes | ~35 |
| UI/UX redesign | ~20 |
| Infrastructure/deploy | ~15 |
| Calendar/OAuth fixes | ~10 |
| Documentation | ~5 |

---

## Before vs After

| Aspect | Before (v1.0.3) | After (current) |
|--------|-----------------|-----------------|
| Recording method | Chrome extension only | Chrome extension + Playwright bot + Recall.ai |
| Platforms | Google Meet, Zoom Web | Google Meet, Zoom, Microsoft Teams |
| Calendar | Basic single calendar | Multi-calendar with auto-join |
| Delivery | Slack, Email, Notion | + WhatsApp, Digest reports |
| Auth | Basic login/signup | + Email verification, forgot/reset password |
| Onboarding | None | Multi-step wizard + 5-email drip |
| Theme | Light default | Dark default, orange/amber brand |
| Landing page | Generic | India-first, 22 languages showcase |
| Edge functions | 16 | 33 |
| Settings | Single page | Tab-based (Account, Recording, Integrations, Notifications) |
| Meeting detail | Separate page only | + Modal overlay from any list |
| Bot customization | None | Custom name + icon color |
| Total commits | 92 | 217 |
