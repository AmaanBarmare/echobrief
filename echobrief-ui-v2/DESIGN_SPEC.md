# EchoBrief UI v2 — design spec

> **Brand tokens:** the palette and fonts below are the ratified brand (see `BRAND_DECISION.md`). The repo's brand system is updated to these values in Phase 0; the mockups are the exact target.

Direction: "Console" — dark sidebar, warm light content, one card level, terracotta as the single accent, pill-shaped controls. Same system on desktop and mobile. Values live in `ui-kit/tokens.css` and move into the repo's brand system in Phase 0; this document explains how to use them.

## 1. Page frame (desktop)
- Sidebar 232px, background `--eb-sidebar` (#1F1B18). Top: logo + workspace switcher chevron. Nav in three labelled groups (uppercase 10.5px, #6E665F, letter-spacing .09em):
  **Capture** Meetings · Calendar · Action items — **Understand** Contacts · Coaching · Ask — **Manage** Workspace · Settings.
  Nav item: 34px high, 8px radius, 13.5px, text #B8B0A8, icon #8A827A. Active: white text, icon #F4A574, bg rgba(255,255,255,.07), inset 1px ring rgba(255,255,255,.06), and a 3×16px bar (#E2825A) on the far left edge.
  Bottom: plan card (12px radius, translucent white gradient, usage bar in #E2825A→#F4A574, "Renews 1 Oct · Upgrade") then user card (30px gradient avatar, name, email, ⋯).
- Header 60px: pill search (360px wide, ⌘K kbd chip) left; bell icon-button + page primary action right. Meetings/Calendar/Contacts/Coaching/Ask/Workspace use the **Record** split button; Action items uses "Add item"; Settings has no primary action.
- Content: padding 16px 32px 32px. Every page begins with `PageHeader`: eyebrow (group name, 11px 600 uppercase, accent colour) → H1 (Outfit 600 26px, -.02em) → subtitle (13.5px secondary). Actions align to the H1 baseline on the right.
- Two-column pages use `grid-template-columns: minmax(0,1fr) 320px; gap 24px` (Meetings home, Meeting detail, Coaching, Workspace). Contacts uses `340px minmax(0,1fr)`. Settings uses `200px minmax(0,1fr); gap 32px` with content max-width 760px.

## 2. Page frame (mobile, 390px)
- Top: 56px safe area, then a 36px bar: logo (or "← Back" link) left, page action + 32px avatar right. H1 26px below, subtitle 13.5px.
- Content padding 16px 20px. Cards 14px radius. Rows ≥44px tall.
- Bottom tab bar 84px, rgba(255,255,255,.92) + blur, 1px top border. Tabs: Meetings · Calendar · Tasks · Ask · More. Active tab: icon in a 44×28 pill of `--eb-accent-soft`, label 10.5px 600 accent colour. Contacts, Coaching, Workspace and Settings live under **More**.
- Record is a pill in the top bar. Full-width primary buttons are 44px high, 12px radius. Do not draw a status bar or keyboard.

## 3. Type
| Role | Font | Size / weight |
|---|---|---|
| H1 | Outfit | 26px 600, -.02em |
| Card / section title | Outfit | 15px 600 |
| Stat number | Outfit | 26px 600 (24 on mobile) |
| Body | DM Sans | 14–14.5px 400, line-height 1.5–1.6 |
| Row title | DM Sans | 14px 500 |
| Secondary / meta | DM Sans | 12.5–13px, `--eb-text-secondary` |
| Caption | DM Sans | 12px, `--eb-text-muted` |
| Eyebrow / group label | DM Sans | 11 / 10.5px 600 uppercase .09em |
| In-card label (DECISIONS…) | DM Sans | 11.5px 500 uppercase .06em |
| Timestamps, tokens, code | JetBrains Mono | 11–12.5px |
| Wordmark | Instrument Serif | "echo" + italic "brief" in accent |

## 4. Colour
Backgrounds: page #F5F1EC, card #FFF, alt row #FBFAF8, border #E6DFD7, divider #EFEAE4, chip #EBE5DE.
Text: #1C1917 primary, #3F3A36 prose, #78716C secondary, #A8A29E muted.
Accent: #C2410C (hover #9A3412). Soft #F7EFE8 with text #9A3412 for selected chips and soft tiles. On the dark sidebar use #F4A574.
Semantic: green #2F7A4D/#E8F3EC (done, connected, bot will join) · amber #B45309/#FDF3E1 (attention, medium priority, risk flag text #7C4A03) · red #B42318/#FBEAE7 (destructive, high priority, failed).
Rule: terracotta is only for the primary action, selected state, the eyebrow, the active nav icon and one highlighted number per stat row. Never orange and red side by side.

## 5. Components
**Button** (h36, pill) — primary: gradient #D0521E→#C2410C, white, inset 1px highlight + 1px ring rgba(154,52,18,.35). secondary: #FFF→#FAF8F5, 1px #E6DFD7, 1px shadow; icon tinted secondary text. dark: #1F1B18 (emphasis: New token, Invite). destructive: white, #EFC7C0 border, red text. Icon-only = 36×36 circle. Small = 32px.
**Split button** (Record): primary pill, main label + chevron segment separated by 1px rgba(255,255,255,.22).
**Chip** (h32, pill, 13px 500) — active: dark fill #1F1B18 white text; selected filter: #F7EFE8 fill, accent border, #9A3412 text; default: white, border, 1px shadow. Chip rows have 6px gap. Tabs, segmented controls and the Settings rail are all chip rows — never underline tabs.
**Badge** — pill, 12px 500, 3px 9px padding; `dot` variant adds a 6px circle in the text colour (Summarized, Connected, Bot will join, Active, Current).
**Select** — h34 pill, chevron right, 1px shadow. **Input** — h38, 9px radius, inset shadow, white. **Textarea** same at auto height.
**Toggle** — 38×22, knob 18px with drop shadow. **Checkbox** — 18px, radius 6, accent fill when checked.
**Card** — 14px radius, 1px border, `0 1px 2px rgba(28,25,23,.04)`. One level only: inside a card use dividers (#EFEAE4), never another card. Lists inside cards: header strip (title + count/actions, 12px 12px 12px 18px) then rows with 13px 18px padding and dividers; hover row bg #FBF8F4.
**Section** (Settings) — card with header strip (title 15px + description) and body padding 18px 20px.
**StatTile** — label 12.5px secondary + 28px round icon chip on the right; number Outfit 26px; delta 12px muted. Highlighted tile: icon chip and number in accent.
**Avatar** — initial, Outfit 600, 6 warm bg/fg pairs keyed by initial; 9px radius in rows, circle in people lists; 20px stacked circles for participants.
**BrandTile** — 36px white tile, 1px border, 9px radius, mark at ~54% size. Marks: gcal, outlook, slack, zoho (in `brands/`), meet + zoom (simple-icons). Email delivery (Resend) is not a brand — it uses a `mail` icon on an accent-soft tile.
**Dark panel** (prep card, coaching tip, bot preview) — #1F1B18, 14px radius, eyebrow in #F4A574, body #B8B0A8.
**Code block** — #1F1B18, 10px radius, JetBrains Mono 12.5px #E8E1DA, keywords #F4A574, strings #9FCB8F, "Copy" chip top-right.
**Video player** (Recording tab; source is the Recall-signed MP4 URL from `get-recording-media`, resolved per view — never a Storage object) — dark 12px frame, participant tiles, bottom gradient with 4px scrubber (#F4A574 progress, white knob, chapter ticks), play/skip/time/speed/captions/volume/fullscreen. Under it: "who spoke when" bar (speaker colours, 10px tall) and chapter chips (mono timestamp + label). Right: transcript with "Follows video" badge, active line in `--eb-accent-soft`.

## 6. Icons
`lucide-react`, 1.75px stroke (2px on primary buttons), 16px in nav, 15px in buttons, 14px inline meta. Mapping used in the mockups: Meetings=mic, Calendar=calendar, Action items=square-check, Contacts=users, Coaching=target, Ask=message-circle, Workspace=building-2, Settings=settings, Account=user, Bot=bot, Integrations=plug, Billing=credit-card, Security=lock, Developer=code-2, Record=mic, Sync=refresh-cw, Share=share, Export/Download=download, Prep/AI=sparkles, Risk=flag, Search=search, Filter=sliders-horizontal, More=ellipsis, Notifications=bell.
No emoji anywhere.

## 7. Page notes
- **Meetings home**: 4 stat tiles → "Recent meetings" list card (avatar, title, participants, date, duration, Summarized badge, chevron) with filter chips in its header. Right rail: Today (time + 2px accent left rule), dark Prep card for the next external call, Due this week.
- **Meeting detail**: back link → H1 → meta row (date, duration, platform tile, stacked participant avatars, language badge) → chip tabs Summary · Recording · Transcript · Coaching · Facts, with a processing note on the right. Summary tab: summary + DECISIONS + RISKS FLAGGED (amber panel) card, Key moments card; rail: Action items, Numbers mentioned, Coaching mini-scores, Recording thumbnail card.
- **Action items**: pill stat counters in the header; chip filter row + three pill selects; one list card grouped by meeting (group header on #FBFAF8 with count) with checkbox, text, assignee avatar chip, priority badge, due date.
- **Settings**: 200px chip rail (dark active) + stacked Sections. Bot: swatch row (44px rounded squares, selected has ring + check) and a dark Meet preview. Developer: token list with device icons, client chip picker over dark code blocks, MCP tool cards, webhook with deliveries log. Integrations: Calendars (brand tiles + toggles + "Add Google Calendar / Add Outlook" with marks), Delivery (Email via Resend, Slack), CRM (Zoho CRM). There is no WhatsApp delivery — do not add it.
- **Calendar**: one card, day groups (left column label) of rows with time, platform tile, title, meta, Bot-will-join badge, toggle.
- **Contacts**: 340px people list card (search on top, selected row in accent-soft) + right: person header, Account brief card (brief text, OUR/THEIR commitments, KEY NUMBERS chips, PREP list), Meetings card.
- **Coaching**: 4 stat tiles with sparklines → Recent coached calls list + rail (Week by week table, dark "This week, try" card).
- **Ask**: 260px conversation list card + centred thread (dark user bubble, answer with superscript citations, citation cards with mono index) + pill composer.
- **Workspace**: members list card + invite card; rail: workspace summary, sharing defaults.
