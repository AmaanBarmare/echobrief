import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';
import { ChevronRight, Zap, MessageCircle, Settings, HelpCircle, Shield } from 'lucide-react';

export default function Docs() {
  const sections = [
    {
      title: 'Getting Started',
      icon: <Zap size={24} />,
      items: [
        { name: 'What is EchoBrief?', id: 'what-is' },
        { name: 'Installation & Setup', id: 'setup' },
        { name: 'First Meeting', id: 'first-meeting' },
      ],
    },
    {
      title: 'Using EchoBrief',
      icon: <Settings size={24} />,
      items: [
        { name: 'Recording Meetings', id: 'recording' },
        { name: 'Customizing Your Bot', id: 'bot-customization' },
        { name: 'AI Summaries & Insights', id: 'summaries' },
        { name: 'Delivery Options', id: 'delivery' },
      ],
    },
    {
      title: 'Features',
      icon: <Zap size={24} />,
      items: [
        { name: '22 Indian Languages', id: 'languages' },
        { name: 'Email & Slack Integration', id: 'integrations' },
        { name: 'Scheduled Digests', id: 'digests' },
        { name: 'Transcript Storage', id: 'transcripts' },
        { name: 'Delivery History', id: 'history' },
      ],
    },
    {
      title: 'Support & FAQ',
      icon: <HelpCircle size={24} />,
      items: [
        { name: 'Troubleshooting', id: 'troubleshooting' },
        { name: 'Privacy & Security', id: 'privacy' },
        { name: 'DPDP Compliance', id: 'dpdp' },
        { name: 'Contact Support', id: 'support' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            ← Back to Home
          </Link>

          <h1 className="text-4xl font-bold mb-4">Documentation</h1>
          <p className="text-lg text-muted-foreground mb-12">
            Learn how to use EchoBrief to transform your meetings into actionable insights.
          </p>

          {/* Quick Navigation Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-16">
            {sections.map((section, idx) => (
              <div
                key={idx}
                className="p-6 rounded-lg border border-border bg-card hover:border-foreground/30 transition-colors"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div style={{ color: '#F97316' }}>{section.icon}</div>
                  <h2 className="text-xl font-semibold">{section.title}</h2>
                </div>
                <ul className="space-y-2">
                  {section.items.map((item, itemIdx) => (
                    <li key={itemIdx}>
                      <a
                        href={`#${item.id}`}
                        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <ChevronRight size={16} />
                        {item.name}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Detailed Sections */}
          <article className="prose prose-slate dark:prose-invert max-w-none space-y-12">
            {/* Getting Started */}
            <section id="what-is">
              <h2>What is EchoBrief?</h2>
              <p>
                EchoBrief is an AI-powered meeting intelligence platform built for India. It automatically records, transcribes, and analyzes your meetings in 22 Indian languages, then delivers actionable summaries via email, Slack, or WhatsApp.
              </p>
              <p>
                Whether you're in a sales call, team standup, or client meeting, EchoBrief captures the important details so you don't have to.
              </p>
            </section>

            <section id="setup">
              <h2>Installation & Setup</h2>
              <ol>
                <li>Sign up at <strong>echobrief.in</strong></li>
                <li>Complete the 5-step onboarding (select languages, integrations, notification preferences)</li>
                <li>Install the Chrome extension (if using browser recording)</li>
                <li>Customize your bot name and icon color in Settings</li>
                <li>Start recording your first meeting!</li>
              </ol>
            </section>

            <section id="first-meeting">
              <h2>Your First Meeting</h2>
              <ol>
                <li>Click <strong>"Record"</strong> on the dashboard</li>
                <li>Grant microphone & calendar permissions (if needed)</li>
                <li>Start or join a meeting</li>
                <li>EchoBrief will record and transcribe in real-time</li>
                <li>After the meeting, AI generates summaries automatically (~2-3 minutes)</li>
                <li>View the report in your dashboard or receive it via email</li>
              </ol>
            </section>

            {/* Features */}
            <section id="languages">
              <h2>22 Indian Languages</h2>
              <p>EchoBrief supports:</p>
              <p>
                English • Hindi • Hinglish • Tamil • Telugu • Bengali • Kannada • Marathi • Malayalam • Gujarati • Punjabi • Assamese • Odia • Konkani • Santali • Maithili • Dogri • Manipuri • Urdu • Sanskrit • Sindhi • Kashmiri
              </p>
              <p>Auto-detect the language spoken in your meeting, or manually select it during setup.</p>
            </section>

            <section id="delivery">
              <h2>Delivery Options</h2>
              <ul>
                <li><strong>Email</strong>: HTML-formatted reports with summary, key points, decisions, and action items</li>
                <li><strong>Slack</strong>: Thread-based summaries in your chosen Slack channel</li>
                <li><strong>WhatsApp</strong>: Text-based reports delivered to your WhatsApp number</li>
                <li><strong>Dashboard</strong>: View all reports in one place with full search & filters</li>
              </ul>
            </section>

            <section id="digests">
              <h2>Scheduled Digests</h2>
              <p>
                Get weekly or monthly digests that aggregate all meetings, key decisions, and action items. Configure:
              </p>
              <ul>
                <li>Frequency (weekly/monthly)</li>
                <li>Day and time</li>
                <li>Recipient emails</li>
              </ul>
              <p>
                Or manually send a digest anytime by clicking <strong>"Send Digest Now"</strong> on the dashboard.
              </p>
            </section>

            <section id="bot-customization">
              <h2>Customize Your Bot</h2>
              <p>Make EchoBrief your own:</p>
              <ul>
                <li>Change the bot name (appears in meeting notifications)</li>
                <li>Pick an icon color (6 options: Orange, Blue, Green, Purple, Pink, Cyan)</li>
                <li>Toggle auto-join for calendar-detected meetings</li>
              </ul>
              <p>Go to <strong>Settings → Bot Customization</strong> to update.</p>
            </section>

            {/* Support */}
            <section id="dpdp">
              <h2>DPDP Compliance</h2>
              <p>
                EchoBrief is fully compliant with India's <strong>Data Protection Act, 2023 (DPDP)</strong>:
              </p>
              <ul>
                <li>✅ Explicit consent before recording</li>
                <li>✅ Transparent data handling</li>
                <li>✅ AES-256 encryption in transit and at rest</li>
                <li>✅ Right to access, delete, and portability honored</li>
                <li>✅ No third-party sharing without consent</li>
              </ul>
              <p>
                See our full <strong>Privacy Policy</strong> for details.
              </p>
            </section>

            <section id="support">
              <h2>Need Help?</h2>
              <p>
                Questions or issues? We're here to help:
              </p>
              <ul>
                <li>📧 <strong>Email:</strong> support@echobrief.in</li>
                <li>💬 <strong>In-app Chat:</strong> Click the help icon on your dashboard</li>
                <li>📱 <strong>WhatsApp:</strong> Message us (link in footer)</li>
              </ul>
            </section>
          </article>

          <div className="mt-16 pt-8 border-t border-border">
            <p className="text-sm text-muted-foreground">
              Last updated: April 2, 2026 • © 2026 Oltaflock AI. All rights reserved.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
