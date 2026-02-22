import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export function CTA() {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Dark gradient matching hero */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800" />
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
        backgroundSize: '64px 64px',
      }} />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-[#4C7DFF]/10 rounded-full blur-[120px]" />

      <div className="container relative z-10 mx-auto px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-white/10 text-slate-300 text-sm font-medium mb-8">
            <Sparkles className="w-4 h-4 text-[#4C7DFF]" />
            Start free, no credit card required
          </div>

          <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-6 tracking-tight">
            Ready to transform your meetings?
          </h2>

          <p className="text-lg text-slate-400 mb-10 max-w-xl mx-auto">
            Join thousands of teams who never miss an action item, decision, or
            follow-up again.
          </p>

          <Link to="/auth">
            <Button
              size="xl"
              className="bg-[#4C7DFF] hover:bg-[#3d6ae6] text-white gap-2 h-12 px-8 text-base font-semibold shadow-lg shadow-[#4C7DFF]/25"
            >
              Get Started Free
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}
