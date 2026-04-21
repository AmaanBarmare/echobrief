const phrases = [
  'Auto-join meetings',
  '22 Indian languages',
  'Accurate speaker names',
  'Clear action items',
  'Slack · WhatsApp · Email',
  'Data stays in India',
];

export function LandingMarquee() {
  const doubled = [...phrases, ...phrases];
  return (
    <div
      className="relative overflow-hidden py-4"
      style={{
        borderBottom: '1px solid var(--rule)',
        WebkitMaskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)',
        maskImage: 'linear-gradient(90deg, transparent, black 10%, black 90%, transparent)',
      }}
    >
      <div className="landing-marquee-track flex w-max items-center gap-12 pr-12">
        {doubled.map((text, i) => (
          <span key={`${text}-${i}`} className="flex shrink-0 items-center gap-12">
            <span
              className="whitespace-nowrap text-[13px] font-medium"
              style={{ color: 'var(--ink-mid)' }}
            >
              {text}
            </span>
            <span
              className="h-1 w-1 shrink-0 rounded-full"
              aria-hidden
              style={{ background: 'var(--ink-faint)' }}
            />
          </span>
        ))}
      </div>
    </div>
  );
}
