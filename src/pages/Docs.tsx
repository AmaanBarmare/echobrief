import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import {
  Bot,
  CalendarClock,
  HelpCircle,
  Languages,
  LifeBuoy,
  ListChecks,
  Mail,
  MessagesSquare,
  PlayCircle,
  Plug,
  Rocket,
  Search,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
} from 'lucide-react';

type Section = { id: string; name: string };
type Group = { title: string; icon: JSX.Element; items: Section[] };

const GROUPS: Group[] = [
  {
    title: 'Getting started',
    icon: <Rocket size={18} />,
    items: [
      { id: 'what-is', name: 'What is EchoBrief?' },
      { id: 'how-it-works', name: 'How it works' },
      { id: 'setup', name: 'Account setup' },
      { id: 'first-meeting', name: 'Your first meeting' },
    ],
  },
  {
    title: 'Recording',
    icon: <PlayCircle size={18} />,
    items: [
      { id: 'recording', name: 'Recording a meeting' },
      { id: 'auto-join', name: 'Calendar auto-join' },
      { id: 'bot-customization', name: 'Customising the bot' },
      { id: 'statuses', name: 'Meeting statuses' },
    ],
  },
  {
    title: 'Your meeting intelligence',
    icon: <Sparkles size={18} />,
    items: [
      { id: 'summaries', name: 'Summaries & insights' },
      { id: 'action-items', name: 'Action items' },
      { id: 'metrics', name: 'Conversation metrics' },
      { id: 'transcripts', name: 'Transcripts & speakers' },
      { id: 'playback', name: 'Watching the recording' },
      { id: 'ask', name: 'Ask: chat with your meetings' },
      { id: 'connect', name: 'Connect Claude & other AI tools' },
      { id: 'languages', name: 'Languages' },
    ],
  },
  {
    title: 'Delivery',
    icon: <Mail size={18} />,
    items: [
      { id: 'delivery', name: 'Email summaries' },
      { id: 'digests', name: 'Scheduled digests' },
      { id: 'history', name: 'Search & history' },
    ],
  },
  {
    title: 'Support',
    icon: <LifeBuoy size={18} />,
    items: [
      { id: 'troubleshooting', name: 'Troubleshooting' },
      { id: 'privacy', name: 'Privacy & data' },
      { id: 'dpdp', name: 'DPDP compliance' },
      { id: 'faq', name: 'FAQ' },
      { id: 'support', name: 'Contact support' },
    ],
  },
];

const ALL_SECTIONS = GROUPS.flatMap((g) => g.items);

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 text-2xl font-semibold tracking-tight text-foreground">
      {children}
    </h2>
  );
}

function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn';
  title: string;
  children: React.ReactNode;
}) {
  const styles =
    tone === 'warn'
      ? 'border-amber-500/30 bg-amber-500/5'
      : 'border-border bg-muted/40';
  return (
    <div className={`my-6 rounded-lg border p-4 ${styles}`}>
      <p className="mb-1 text-sm font-semibold text-foreground">{title}</p>
      <div className="text-sm leading-relaxed text-muted-foreground [&_a]:underline">{children}</div>
    </div>
  );
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="my-5 space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3">
          <span
            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: 'var(--ember)' }}
          >
            {i + 1}
          </span>
          <span className="text-[15px] leading-relaxed text-muted-foreground">{item}</span>
        </li>
      ))}
    </ol>
  );
}

export default function Docs() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState<string>(ALL_SECTIONS[0].id);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GROUPS;
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter(
        (i) => i.name.toLowerCase().includes(q) || g.title.toLowerCase().includes(q),
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    ALL_SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-20">
        <div className="container mx-auto px-6">
          <Link
            to="/"
            className="mb-8 inline-flex items-center text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to home
          </Link>

          <header className="mb-12 max-w-3xl">
            <p className="mb-2 text-sm font-medium" style={{ color: 'var(--ember)' }}>
              Documentation
            </p>
            <h1
              className="mb-4 text-4xl font-semibold tracking-tight text-foreground"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Everything you can do with EchoBrief
            </h1>
            <p className="text-lg leading-relaxed text-muted-foreground">
              EchoBrief sends a recording bot to your meetings, transcribes them into English,
              and turns each one into a summary, a decision log, and a set of action items you
              can actually chase. This guide covers setup, day-to-day use, and what to do when
              something looks wrong.
            </p>
          </header>

          <div className="grid gap-12 lg:grid-cols-[240px_minmax(0,1fr)]">
            {/* Sidebar */}
            <aside className="lg:sticky lg:top-24 lg:h-[calc(100vh-8rem)] lg:overflow-y-auto">
              <div className="relative mb-5">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter topics"
                  aria-label="Filter documentation topics"
                  className="w-full rounded-md border border-border bg-card py-2 pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-foreground/30"
                />
              </div>

              <nav className="space-y-6">
                {filtered.map((group) => (
                  <div key={group.title}>
                    <div className="mb-2 flex items-center gap-2">
                      <span style={{ color: 'var(--ember)' }}>{group.icon}</span>
                      <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                        {group.title}
                      </h2>
                    </div>
                    <ul className="space-y-0.5 border-l border-border">
                      {group.items.map((item) => (
                        <li key={item.id}>
                          <a
                            href={`#${item.id}`}
                            aria-current={active === item.id ? 'true' : undefined}
                            className={`-ml-px block border-l py-1.5 pl-3 text-sm transition-colors ${
                              active === item.id
                                ? 'border-l-2 font-medium text-foreground'
                                : 'border-transparent text-muted-foreground hover:text-foreground'
                            }`}
                            style={active === item.id ? { borderColor: 'var(--ember)' } : undefined}
                          >
                            {item.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <p className="text-sm text-muted-foreground">No topics match “{query}”.</p>
                )}
              </nav>
            </aside>

            {/* Content */}
            <article className="max-w-3xl space-y-14 text-[15px] leading-relaxed text-muted-foreground">
              {/* ---------------- Getting started ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="what-is">What is EchoBrief?</SectionHeading>
                <p>
                  EchoBrief is an AI meeting intelligence platform. A recording bot joins your
                  Google Meet, Zoom, or Microsoft Teams call, records the conversation, and
                  afterwards produces a written record you can search, share, and act on.
                </p>
                <p>You get, for every meeting:</p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>An executive summary and a longer detailed summary</li>
                  <li>Action items with an owner, a priority, and what success looks like</li>
                  <li>Explicit decisions and commitments</li>
                  <li>Risks, blockers, and open questions</li>
                  <li>A timestamped timeline of the conversation</li>
                  <li>Conversation metrics — talk time, who held the floor, questions, turn-taking</li>
                  <li>A full transcript with real participant names</li>
                </ul>
                <Callout title="Recording is bot-based">
                  EchoBrief does not record from your browser and never asks for microphone
                  access. A visible bot joins the call as a participant, which means everyone in
                  the meeting can see that it is being recorded.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="how-it-works">How it works</SectionHeading>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    { n: '01', t: 'The bot joins', d: 'You paste a meeting link, or your calendar triggers it automatically. The bot asks to be admitted and starts recording.' },
                    { n: '02', t: 'Audio is transcribed', d: 'After the call ends, the recording is transcribed into English — whatever language was spoken.' },
                    { n: '03', t: 'Speakers are named', d: 'Segments are matched against who was actually talking, so the transcript reads with real names.' },
                    { n: '04', t: 'Insights are generated', d: 'A summary, decisions, risks and action items are extracted and saved to your dashboard.' },
                    { n: '05', t: 'It lands in your inbox', d: 'If email summaries are on, the report is delivered automatically.' },
                    { n: '06', t: 'You can ask questions', d: 'Ask searches across every meeting you have recorded and answers with citations.' },
                  ].map((s) => (
                    <div key={s.n} className="rounded-lg border border-border bg-card p-4">
                      <p className="mb-1 text-xs font-semibold" style={{ color: 'var(--ember)' }}>
                        {s.n}
                      </p>
                      <p className="mb-1 text-[15px] font-semibold text-foreground">{s.t}</p>
                      <p className="text-sm">{s.d}</p>
                    </div>
                  ))}
                </div>
                <p className="text-sm">
                  Most meetings finish processing within a few minutes of the call ending. Longer
                  meetings take proportionally longer, because the audio is split into chunks and
                  transcribed in parallel.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="setup">Account setup</SectionHeading>
                <Steps
                  items={[
                    <>Sign in at <strong className="text-foreground">echobrief.in</strong>. Access is currently invite-based — join the waitlist from the homepage if you do not have an account yet.</>,
                    <>Complete onboarding: choose your preferred languages and, optionally, connect Google Calendar.</>,
                    <>Open <strong className="text-foreground">Settings</strong> to name your bot, pick its colour, and confirm email summaries are on.</>,
                    <>Record your first meeting.</>,
                  ]}
                />
                <Callout title="Connecting Google Calendar is optional">
                  Without it you can still record any meeting by pasting its link. With it,
                  EchoBrief can see your upcoming meetings and — if you enable auto-join — send the
                  bot for you.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="first-meeting">Your first meeting</SectionHeading>
                <Steps
                  items={[
                    <>On the dashboard, click <strong className="text-foreground">Start New Recording</strong>.</>,
                    <>Enter a meeting title and paste the meeting URL (Google Meet, Zoom, or Teams).</>,
                    <>Start the recording. The bot will request to join the call.</>,
                    <><strong className="text-foreground">Admit the bot</strong> when it appears in the waiting room. If nobody admits it, the meeting is marked cancelled and nothing is recorded.</>,
                    <>Hold your meeting as normal. The dashboard shows live status.</>,
                    <>End the call. Processing begins automatically and the meeting moves to <strong className="text-foreground">Completed</strong>.</>,
                  ]}
                />
              </section>

              {/* ---------------- Recording ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="recording">Recording a meeting</SectionHeading>
                <p>There are two ways to get a bot into a meeting:</p>
                <div className="my-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 font-semibold text-foreground">Method</th>
                        <th className="py-2 font-semibold text-foreground">When to use it</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr>
                        <td className="py-2.5 pr-4 align-top font-medium text-foreground">Paste a link</td>
                        <td className="py-2.5">Ad-hoc calls, meetings not on your calendar, or someone else's invite.</td>
                      </tr>
                      <tr>
                        <td className="py-2.5 pr-4 align-top font-medium text-foreground">Calendar auto-join</td>
                        <td className="py-2.5">Recurring and scheduled meetings you always want recorded.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p>
                  Supported platforms: <strong className="text-foreground">Google Meet</strong>,{' '}
                  <strong className="text-foreground">Zoom</strong>, and{' '}
                  <strong className="text-foreground">Microsoft Teams</strong>.
                </p>
                <Callout tone="warn" title="Someone has to let the bot in">
                  The bot joins as a participant and usually lands in the waiting room. If it is
                  not admitted before the meeting starts, it gives up and the meeting is marked
                  cancelled — no audio is captured. Tell your host to expect it, or give the bot a
                  recognisable name in Settings.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="auto-join">Calendar auto-join</SectionHeading>
                <p>
                  With Google Calendar connected and auto-join enabled, EchoBrief checks your
                  calendar every few minutes and dispatches a bot to meetings that are about to
                  start — roughly five to seven minutes ahead of time.
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Only events with a recognisable meeting link are eligible.</li>
                  <li>Each calendar event gets at most one bot, even across multiple checks.</li>
                  <li>Turn it off any time in <strong className="text-foreground">Settings</strong>; existing recordings are unaffected.</li>
                </ul>
                <Callout tone="warn" title="Auto-join records everything it can">
                  If it is on your calendar and it has a link, the bot will try to join it —
                  including one-to-ones and interviews. Review what is on your calendar before
                  enabling it.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="bot-customization">Customising the bot</SectionHeading>
                <p>
                  Go to <strong className="text-foreground">Settings → Bot customisation</strong>:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    <strong className="text-foreground">Bot name</strong> — what participants see in
                    the participant list. A clear name like “Priya's Notetaker” gets admitted faster
                    than something generic.
                  </li>
                  <li>
                    <strong className="text-foreground">Icon colour</strong> — Orange, Blue, Green,
                    Purple, Pink, or Cyan.
                  </li>
                  <li>
                    <strong className="text-foreground">Auto-join</strong> — the calendar toggle
                    described above.
                  </li>
                </ul>
              </section>

              <section className="space-y-4">
                <SectionHeading id="statuses">Meeting statuses</SectionHeading>
                <p>Every meeting on your dashboard carries a status. What each one means:</p>
                <div className="my-4 overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="py-2 pr-4 font-semibold text-foreground">Status</th>
                        <th className="py-2 font-semibold text-foreground">Meaning</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {[
                        ['Scheduled', 'Picked up from your calendar. The bot has not been sent yet.'],
                        ['Joining', 'The bot is asking to be admitted to the call.'],
                        ['Recording', 'The bot is in the meeting and capturing audio.'],
                        ['Processing', 'The call ended. Audio is being transcribed and analysed.'],
                        ['Completed', 'Transcript, summary, and insights are ready.'],
                        ['Cancelled', 'The bot never got into the meeting — usually not admitted, or removed from the waiting room. Nothing was recorded and nothing went wrong on our side. Dropped from the dashboard automatically.'],
                        ['Failed', 'Something needs your attention — most often an invalid or expired meeting link. Dropped from the dashboard automatically; search for the title to open the meeting and see the reason.'],
                      ].map(([s, d]) => (
                        <tr key={s}>
                          <td className="whitespace-nowrap py-2.5 pr-4 align-top font-medium text-foreground">
                            {s}
                          </td>
                          <td className="py-2.5">{d}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* ---------------- Intelligence ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="summaries">Summaries & insights</SectionHeading>
                <p>
                  Open any completed meeting to see the full report. It is deliberately more than
                  a summary:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Executive summary</strong> — why the meeting happened, what changed, what happens next.</li>
                  <li><strong className="text-foreground">Notes by topic</strong> — the longer write-up, grouped the way Fireflies-style notes are, with speaker names.</li>
                  <li><strong className="text-foreground">Action items</strong> — verb-first commitments, with an owner and a due date only when those were spoken.</li>
                  <li><strong className="text-foreground">Decisions</strong> — only explicit agreement, not “we should” or “maybe”.</li>
                  <li><strong className="text-foreground">Open questions and risks</strong> — unresolved concerns, so silence is not mistaken for alignment.</li>
                  <li><strong className="text-foreground">Outline</strong> — chapter headings whose timestamps come from the transcript clock, not a guess.</li>
                  <li><strong className="text-foreground">Numbers &amp; asks</strong> — every hard number spoken (revenue, volumes, rates), what the other party explicitly asked for, and each objection with whether it was addressed — each with the verbatim quote and a timestamp that jumps into the recording.</li>
                  <li><strong className="text-foreground">Coaching</strong> — on external calls, a Coaching tab benchmarks your talk ratio, longest monologue, questions and hedge words against discovery-call guidelines, flags moments (an objection you talked past, a next step left vague) and charts the other side's engagement over the call.</li>
                </ul>
                <p>
                  Every timestamp on the page — in the outline, the transcript, action items and
                  coaching evidence — is a link into the recording at that moment.
                </p>
                <p>
                  Two buttons in the header act on the report: <strong className="text-foreground">Draft
                  follow-up</strong> writes the follow-up email from the extracted facts (their own words
                  for what they need, the commitments both ways, the agreed time — nothing invented) for
                  you to edit and send; <strong className="text-foreground">Regenerate</strong> rebuilds
                  the whole report from the stored transcript with the current pipeline, which is how
                  older meetings gain the Numbers &amp; asks and Coaching sections.
                </p>
                <Callout title="Grounded in the transcript, twice over">
                  The report is written in two passes: first the facts are extracted with the exact
                  words that support them, then the summary is written from those facts alone. A
                  third check flags any claim it cannot trace back — you will see a small note on
                  the summary when that happens.
                </Callout>
                <Callout title="Accuracy over completeness">
                  The analysis is instructed not to invent detail, not to assign an owner unless it
                  was stated or strongly implied, and to prefer an open question over a guess. A
                  shorter, correct report is the intended outcome.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="action-items">Action items</SectionHeading>
                <p>
                  Each action item carries a task description, an owner (where one was named), a
                  priority, a confidence level, and what success looks like. When a due date was
                  spoken as a day (“Tuesday”, “next week”), it is resolved against the meeting's own
                  date — so you see <em>Tue, Sep 1</em>, not a word that means nothing a week later.
                  Items with a resolved date get an <strong className="text-foreground">Add to
                  calendar</strong> button that creates the follow-up in your Google Calendar at the
                  original meeting's time; attendees are invited only if you tick the box. If you
                  connected Google Calendar before September 2026 the connection is read-only —
                  reconnect it once under Settings → Integrations to allow event creation.
                </p>
                <p>
                  The <strong className="text-foreground">Action Items</strong> page collects them
                  across every meeting, so you can work through commitments in one place and tick
                  them off as they are done. Completion state is yours alone.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="metrics">Conversation metrics</SectionHeading>
                <p>
                  Each meeting includes measured conversation statistics. These are calculated
                  arithmetically from the timing of every speech segment — they are measurements,
                  not estimates from a language model.
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li><strong className="text-foreground">Talk time per speaker</strong> — seconds and share of total speech, plus turns, questions asked, words, and speaking pace.</li>
                  <li><strong className="text-foreground">Airtime</strong> — who held the floor, as a share of speech. Shown when two or more people spoke.</li>
                  <li><strong className="text-foreground">Questions and back-and-forth</strong> — how many questions were asked, and how often the floor changed per minute.</li>
                  <li><strong className="text-foreground">Silence</strong> — how much of the meeting had nobody speaking, including dead air before the first word and after the last.</li>
                  <li><strong className="text-foreground">Longest monologue</strong> — the longest genuinely uninterrupted stretch. A pause of more than fifteen seconds ends it, so this is not simply “total time this person spoke”.</li>
                  <li><strong className="text-foreground">Participation balance</strong> — how evenly speaking time was shared, where 1.00 is perfectly even.</li>
                </ul>
                <Callout title="Solo meetings hide the balance card">
                  Balance describes a relationship between speakers. With only one speaker there is
                  nothing to compare, so the card is hidden rather than showing a meaningless
                  perfect score.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="transcripts">Transcripts &amp; speakers</SectionHeading>
                <p>
                  Every completed meeting stores a full transcript with timestamps and speaker
                  labels. Where EchoBrief can match a speech segment to a participant, the
                  transcript uses their real name.
                </p>
                <p>
                  Occasionally you will see generic labels like{' '}
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[13px] text-foreground">
                    SPEAKER_00
                  </code>
                  . That means participant information was not available for that recording — the
                  transcript is still accurate, only the names are missing.
                </p>
                <Callout title="Your pre-call and post-call chatter stays private">
                  The bot joins before your guests and keeps recording after they leave. EchoBrief
                  works out when the first external participant arrived and when the last one left,
                  and treats speech outside that window as internal. Internal segments are excluded
                  from the summary, the email and anything an AI tool reads through the connector;
                  you can reveal them on the transcript with <em>Show internal audio</em>, where
                  they are marked <em>Internal — not shared</em>. Meetings with only your own team
                  have no trimming.
                </Callout>
                <p>
                  Company, product and client names the transcription keeps misspelling can be
                  fixed for good under <strong className="text-foreground">Settings → Custom
                  vocabulary</strong>: add the correct spelling once and it is enforced in every
                  future transcript and summary. If a speaker was mislabelled, click their name in
                  the transcript to rename them — the change applies to the metrics, action items,
                  facts and coaching too, and survives a regeneration.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="contacts">Contacts &amp; account briefs</SectionHeading>
                <p>
                  Everyone from outside your company who attends a recorded meeting becomes a contact
                  automatically — name, email, company from their domain — with every meeting, number
                  and commitment attached to their timeline. Before the next call, open the contact and
                  press <strong className="text-foreground">Generate brief</strong>: a two-minute read of
                  where things stand, open commitments on both sides, objections never resolved, and
                  what to bring.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="coaching">Coaching scorecard</SectionHeading>
                <p>
                  The Coaching page rolls every external call up by week: talk ratio, hedge-word
                  density, how often a next step was secured and how often objections were handled,
                  with the individual calls underneath. Reports exist for calls processed after
                  31 August 2026; press Regenerate on an older meeting to add it.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="automation">Automation webhook</SectionHeading>
                <p>
                  Under <strong className="text-foreground">Settings → Automation webhook</strong> you
                  can give EchoBrief a URL. Within a minute of a meeting's insights being ready it POSTs
                  a JSON payload — summary, action items with resolved dates, the extracted numbers,
                  commitments and asks, the coaching summary; never the transcript — signed with
                  Standard Webhooks headers so n8n, Make, Zapier or your CRM bridge can verify it. Every
                  delivery is logged on the same settings card.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="playback">Watching the recording</SectionHeading>
                <p>
                  Open a meeting and choose the{' '}
                  <strong className="text-foreground">Recording</strong> tab to play back what the
                  notetaker captured — video where it is available, otherwise the meeting audio.
                </p>
                <p>
                  Recordings are available for{' '}
                  <strong className="text-foreground">7 days</strong> after the meeting, then they
                  expire. The transcript, summary and action items are the permanent record; the
                  recording is not. Meetings recorded before video playback was introduced have
                  audio only, and that audio is cleared sooner.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="ask">Ask: chat with your meetings</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <MessagesSquare size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Dashboard → Ask</span>
                </div>
                <p>
                  Ask answers questions across your entire meeting history in plain language.
                  Useful for the things a search box cannot answer:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>“What did we decide about pricing?”</li>
                  <li>“Who owns the migration work?”</li>
                  <li>“Has the client raised the deadline concern before?”</li>
                </ul>
                <p>
                  Every answer comes with <strong className="text-foreground">citations</strong> —
                  the specific meetings it drew from — so you can jump straight to the source. If
                  the answer is not in your transcripts, it will say so rather than guess.
                </p>
                <Callout title="Ask only sees your own meetings">
                  Retrieval is scoped to your account at the database level. Meetings that captured
                  no usable speech are excluded, because quoting an empty recording back at you is
                  worse than saying nothing.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="connect">Connect Claude &amp; other AI tools</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Plug size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Settings → Developer</span>
                </div>
                <p>
                  Your meetings do not have to stay inside EchoBrief. Claude on the web and in the
                  mobile app connects through <strong className="text-foreground">Add custom connector</strong>{' '}
                  with the address below and a one-click approval. Claude Code, Claude Desktop, Cursor
                  and any other tool that speaks MCP can do the same, or use a token from Settings →
                  Developer — so you can ask about a past decision without leaving the document you
                  are writing.
                </p>
                <Steps
                  items={[
                    <>
                      Go to <strong className="text-foreground">Settings → Developer</strong> and
                      create an access token. It is shown once — copy it then.
                    </>,
                    <>
                      Add EchoBrief to your tool. In Claude Code that is a single command, shown on
                      the same page.
                    </>,
                    <>
                      Ask away. “What did we decide about pricing last quarter?” now works wherever
                      you are.
                    </>,
                  ]}
                />
                <p>Once connected, the assistant can:</p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Search across every transcript and summary you have</li>
                  <li>Read a specific meeting's transcript, decisions and risks</li>
                  <li>Pull your open action items — and tick them off</li>
                </ul>
                <Callout title="It only ever sees your own meetings">
                  A token stands in for you and nobody else. Scoping is enforced by the database,
                  not by the tool asking nicely, and you can revoke a token at any time from the
                  same page. Apart from ticking an action item, reading is all it can do — it
                  cannot start recordings, spend anything, or delete a meeting.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="languages">Languages</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Languages size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">
                    Speak any of these — read English
                  </span>
                </div>
                <p>
                  Transcription runs in translate mode: whatever language is spoken, the transcript
                  and the summary come back in English. Mixed-language meetings — Hinglish, or
                  switching mid-sentence — are handled the same way.
                </p>
                <p className="rounded-lg border border-border bg-card p-4 text-sm">
                  English · Hindi · Hinglish · Tamil · Telugu · Bengali · Kannada · Marathi ·
                  Malayalam · Gujarati · Punjabi · Assamese · Odia · Konkani · Santali · Maithili ·
                  Dogri · Manipuri · Urdu · Sanskrit · Sindhi · Kashmiri
                </p>
                <p className="text-sm">
                  The spoken language is detected automatically, per segment — a meeting header
                  shows the honest mix (“English 78% · Hindi 22%”) rather than a single label.
                  Lines the transcription left untranslated are translated afterwards, so the
                  transcript reads in English end to end. You can set preferred languages during
                  onboarding to improve results.
                </p>
              </section>

              {/* ---------------- Delivery ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="delivery">Email summaries</SectionHeading>
                <p>
                  When a meeting finishes processing, EchoBrief emails you a formatted report —
                  summary, key points, decisions, and action items. This is on by default and can
                  be turned off in <strong className="text-foreground">Settings → Email summaries</strong>.
                </p>
                <p>Reports are always available in the dashboard, whether or not email is enabled.</p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="digests">Scheduled digests</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <CalendarClock size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">Weekly and monthly recaps</span>
                </div>
                <p>
                  A digest aggregates everything across a period — meetings held, decisions made,
                  and outstanding action items — into a single email. Configure the frequency, the
                  day and time, and who receives it. You can also send one on demand with{' '}
                  <strong className="text-foreground">Send Digest Now</strong>.
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="history">Search &amp; history</SectionHeading>
                <p>
                  The <strong className="text-foreground">Recordings</strong> page lists every
                  meeting with global search and filtering. Cancelled and failed meetings are
                  removed from the dashboard automatically — only meetings that produced (or are
                  about to produce) a transcript are listed. You can still delete a single meeting
                  from its own page.
                </p>
                <Callout title="Audio is not kept forever">
                  Recorded audio is deleted after about 30 days. Transcripts, summaries, and
                  insights are kept — they are the part you come back to.
                </Callout>
              </section>

              {/* ---------------- Support ---------------- */}
              <section className="space-y-4">
                <SectionHeading id="troubleshooting">Troubleshooting</SectionHeading>
                <div className="space-y-5">
                  {[
                    {
                      q: 'The bot never joined the meeting',
                      a: 'It was probably not admitted from the waiting room in time, and the meeting is marked Cancelled. Give the bot a recognisable name in Settings and let your host know to expect it.',
                    },
                    {
                      q: 'The meeting says Failed',
                      a: 'Open the meeting — the reason is shown on the record. The usual cause is an invalid or expired meeting link. Check the link and start a new recording.',
                    },
                    {
                      q: 'The transcript is empty or says no clear speech was detected',
                      a: 'The recording captured silence. Common causes: everyone was on mute, the bot joined a call that never started, or the meeting used a device the platform did not route audio from.',
                    },
                    {
                      q: 'Speakers show as SPEAKER_00 instead of names',
                      a: 'Participant information was not available for that recording. The transcript and the analysis are still accurate — only the labels are generic.',
                    },
                    {
                      q: 'A long meeting is still processing',
                      a: 'Long recordings are split into chunks and transcribed in parallel, which takes longer than a short call. If a meeting has not completed after about twenty minutes, contact support with the meeting title.',
                    },
                    {
                      q: 'I did not get the summary email',
                      a: 'Check Settings → Email summaries is enabled, and look in spam for a message from hello@echobrief.in. The report is always in the dashboard regardless.',
                    },
                  ].map((item) => (
                    <div key={item.q} className="rounded-lg border border-border bg-card p-4">
                      <p className="mb-1.5 flex items-start gap-2 text-[15px] font-semibold text-foreground">
                        <HelpCircle size={17} className="mt-0.5 shrink-0" style={{ color: 'var(--ember)' }} />
                        {item.q}
                      </p>
                      <p className="pl-6 text-sm">{item.a}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeading id="privacy">Privacy &amp; data</SectionHeading>
                <div className="mb-2 flex items-center gap-2">
                  <Shield size={18} style={{ color: 'var(--ember)' }} />
                  <span className="text-sm font-medium text-foreground">What we store, and who sees it</span>
                </div>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>
                    <strong className="text-foreground">Recording is visible.</strong> The bot joins
                    as a named participant, so everyone in the call can see a recorder is present.
                  </li>
                  <li>
                    <strong className="text-foreground">Your data is yours.</strong> Meetings,
                    transcripts, and insights are scoped to your account and enforced at the
                    database level — not merely filtered in the interface.
                  </li>
                  <li>
                    <strong className="text-foreground">Audio is deleted</strong> after roughly 30
                    days. Transcripts and insights are retained until you delete them.
                  </li>
                  <li>
                    <strong className="text-foreground">Processing partners.</strong> Delivering
                    these features means meeting content passes through the recording, speech-to-text,
                    AI analysis, and email providers named in our Privacy Policy. It is not sold or
                    used for advertising.
                  </li>
                  <li>
                    <strong className="text-foreground">Deleting works.</strong> Delete a meeting to
                    remove its record, or delete your account from Settings to remove everything.
                  </li>
                </ul>
                <p className="text-sm">
                  Full detail in the{' '}
                  <Link to="/privacy" className="font-medium text-foreground underline">
                    Privacy Policy
                  </Link>{' '}
                  and{' '}
                  <Link to="/terms" className="font-medium text-foreground underline">
                    Terms
                  </Link>
                  .
                </p>
              </section>

              <section className="space-y-4">
                <SectionHeading id="dpdp">DPDP compliance</SectionHeading>
                <p>
                  EchoBrief is built to operate under India's{' '}
                  <strong className="text-foreground">
                    Digital Personal Data Protection Act, 2023
                  </strong>
                  . In practice that means:
                </p>
                <ul className="ml-5 list-disc space-y-1.5">
                  <li>Recording is never covert — the bot is a visible participant.</li>
                  <li>Data is encrypted in transit and at rest by our infrastructure providers.</li>
                  <li>Access to your meetings is restricted to your account.</li>
                  <li>You can access, export, and delete your data, including your whole account.</li>
                  <li>Processing partners are disclosed in the Privacy Policy.</li>
                </ul>
                <Callout tone="warn" title="Consent is a shared responsibility">
                  Recording laws vary by jurisdiction and by the kind of conversation. EchoBrief
                  makes the bot visible, but you are responsible for having whatever consent your
                  meetings and your local law require.
                </Callout>
              </section>

              <section className="space-y-4">
                <SectionHeading id="faq">FAQ</SectionHeading>
                <div className="space-y-4">
                  {[
                    ['Do participants know they are being recorded?', 'Yes. The bot appears in the participant list with the name you set.'],
                    ['Does EchoBrief need microphone access?', 'No. Nothing is captured from your browser or device — the bot records from inside the meeting.'],
                    ['Can I record a meeting I did not organise?', 'Yes, if you have the link and someone admits the bot.'],
                    ['What happens if I leave early?', 'The bot stays until the meeting ends and records the whole call.'],
                    ['Can I edit a summary?', 'Not yet. The transcript is the source of record; you can copy from it.'],
                    ['Is there a limit on meeting length?', 'Long meetings are supported — they are split into chunks for transcription and take longer to process.'],
                  ].map(([q, a]) => (
                    <div key={q} className="border-b border-border pb-4 last:border-0">
                      <p className="mb-1 text-[15px] font-medium text-foreground">{q}</p>
                      <p className="text-sm">{a}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="space-y-4">
                <SectionHeading id="support">Contact support</SectionHeading>
                <div className="rounded-lg border border-border bg-card p-5">
                  <div className="mb-3 flex items-center gap-2">
                    <Mail size={18} style={{ color: 'var(--ember)' }} />
                    <a
                      href="mailto:support@echobrief.in"
                      className="text-[15px] font-medium text-foreground underline"
                    >
                      support@echobrief.in
                    </a>
                  </div>
                  <p className="text-sm">
                    When reporting a problem with a specific meeting, include the meeting title and
                    roughly when it took place — that is enough for us to find it.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3 pt-1 text-sm">
                  <Link
                    to="/privacy"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <Shield size={15} /> Privacy Policy
                  </Link>
                  <Link
                    to="/terms"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <ListChecks size={15} /> Terms
                  </Link>
                  <Link
                    to="/dashboard"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <Bot size={15} /> Open dashboard
                  </Link>
                  <Link
                    to="/settings"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-foreground transition-colors hover:border-foreground/30"
                  >
                    <SettingsIcon size={15} /> Settings
                  </Link>
                </div>
              </section>

              <div className="border-t border-border pt-8">
                <p className="text-sm text-muted-foreground">
                  Last updated: 21 August 2026 · © 2026 Oltaflock AI. All rights reserved.
                </p>
              </div>
            </article>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
