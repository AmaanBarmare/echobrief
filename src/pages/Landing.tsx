import { Navbar } from '@/components/landing/Navbar';
import { Hero } from '@/components/landing/Hero';
import { IntegrationStrip } from '@/components/landing/IntegrationStrip';
import { LandingMarquee } from '@/components/landing/LandingMarquee';
import { Features } from '@/components/landing/Features';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Languages } from '@/components/landing/Languages';
import { LandingFAQ } from '@/components/landing/LandingFAQ';
import { CTA } from '@/components/landing/CTA';
import { Footer } from '@/components/landing/Footer';

export default function Landing() {
  return (
    <div className="landing-shell landing-mesh landing-grain min-h-screen bg-background font-sans text-foreground antialiased selection:bg-orange-500/25 selection:text-foreground">
      <Navbar />
      <main>
        <Hero />
        <IntegrationStrip />
        <LandingMarquee />
        <Features />
        <HowItWorks />
        <Languages />
        <LandingFAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
