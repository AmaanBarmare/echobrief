import { Mic, Cpu, MessageSquare, CheckCircle } from 'lucide-react';

const steps = [
  {
    icon: Mic,
    step: '01',
    title: 'Record Your Meeting',
    description:
      'Click to start recording or let us auto-detect from your calendar. We capture both system audio and microphone.',
  },
  {
    icon: Cpu,
    step: '02',
    title: 'AI Processes Audio',
    description:
      'Our AI transcribes the conversation with speaker detection and generates structured insights automatically.',
  },
  {
    icon: MessageSquare,
    step: '03',
    title: 'Get Slack Summary',
    description:
      'Receive a beautifully formatted summary with action items, decisions, and key points in your Slack channel.',
  },
  {
    icon: CheckCircle,
    step: '04',
    title: 'Take Action',
    description:
      'Search transcripts, review insights, and keep your team aligned. Never miss a follow-up again.',
  },
];

export function HowItWorks() {
  return (
    <section className="py-24 bg-muted/30">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center mb-16">
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-foreground mb-4 tracking-tight">
            How it works
          </h2>
          <p className="text-lg text-muted-foreground">
            From meeting to actionable insights in minutes
          </p>
        </div>

        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-10">
            {steps.map((step, index) => (
              <div
                key={step.step}
                className="relative animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                {index < steps.length - 1 && (
                  <div
                    className="hidden lg:block absolute top-14 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-px bg-gradient-to-r from-accent/40 to-transparent"
                    aria-hidden
                  />
                )}

                <div className="relative z-10 text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-card border-2 border-accent/20 shadow-md mb-5 hover:border-accent/40 transition-colors">
                    <step.icon className="w-8 h-8 text-accent" />
                  </div>

                  <div className="text-accent font-mono text-xs font-bold mb-2 tracking-wider">
                    {step.step}
                  </div>

                  <h3 className="text-lg font-semibold text-foreground mb-3">
                    {step.title}
                  </h3>

                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
