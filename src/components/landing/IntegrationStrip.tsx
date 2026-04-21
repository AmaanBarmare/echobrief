import { Calendar, Mail, MessageCircle, MonitorPlay, Slack, Video } from 'lucide-react';

const items = [
  { Icon: Video, label: 'Google Meet' },
  { Icon: MonitorPlay, label: 'Zoom' },
  { Icon: MonitorPlay, label: 'Teams' },
  { Icon: Calendar, label: 'Google Calendar' },
  { Icon: Slack, label: 'Slack' },
  { Icon: MessageCircle, label: 'WhatsApp' },
  { Icon: Mail, label: 'Email' },
];

export function IntegrationStrip() {
  return (
    <section
      id="integrations"
      className="scroll-mt-24"
      style={{ borderBottom: '1px solid var(--rule)' }}
    >
      <div className="mx-auto max-w-[1200px] px-6 py-10 md:px-8">
        <p
          className="mb-5 text-center text-[12.5px] font-medium uppercase tracking-wide"
          style={{ color: 'var(--ink-soft)' }}
        >
          Works with your existing stack
        </p>
        <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4 md:gap-x-14">
          {items.map(({ Icon, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Icon className="h-[16px] w-[16px]" strokeWidth={1.75} style={{ color: 'var(--ink-mid)' }} />
              <span className="text-[14px] font-medium" style={{ color: 'var(--ink)' }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
