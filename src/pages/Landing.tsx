import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { IntegrationStrip } from '@/components/landing/IntegrationStrip';
import { LandingMarquee } from '@/components/landing/LandingMarquee';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Languages } from '@/components/landing/Languages';
import { Pricing } from '@/components/landing/Pricing';
import { LandingFAQ } from '@/components/landing/LandingFAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

export default function Landing() {
  const { hash } = useLocation();

  // Arriving at /#waitlist (from the Auth page) lands here before the section
  // exists, so the browser's own hash scroll is a no-op. Do it once on mount.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
  }, [hash]);

  return (
    <div
      className="landing-shell landing-mesh landing-grain min-h-screen antialiased"
      style={{
        background: 'var(--landing-bg)',
        color: 'var(--landing-text)',
        fontFamily: 'var(--font-body-brand)',
      }}
    >
      <Navbar />
      <main>
        <Hero />
        <IntegrationStrip />
        <LandingMarquee />
        <Features />
        <HowItWorks />
        <Languages />
        <Pricing />
        <LandingFAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
