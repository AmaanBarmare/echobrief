const phrases = [
  '22 Indian languages',
  'Speaker diarization',
  'Calendar-aware bot',
  'Action items with owners',
  'Risk & decisions',
  'WhatsApp delivery',
  'Slack threads',
  'DPDP-aligned flow',
];

export function LandingMarquee() {
  const doubled = [...phrases, ...phrases];
  return (
    <div className="relative overflow-hidden border-y border-border/40 bg-gradient-to-r from-orange-500/[0.06] via-transparent to-amber-500/[0.06] py-3 dark:from-orange-500/10 dark:to-amber-500/10">
      <div className="landing-marquee-track flex w-max gap-10 pr-10">
        {doubled.map((text, i) => (
          <span
            key={`${text}-${i}`}
            className="flex shrink-0 items-center gap-10 text-[13px] font-medium text-muted-foreground"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            <span className="whitespace-nowrap">{text}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-orange-500/50" aria-hidden />
          </span>
        ))}
      </div>
    </div>
  );
}
