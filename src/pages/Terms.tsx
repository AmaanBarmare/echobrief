import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function Terms() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            ← Back to Home
          </Link>
          <article className="prose prose-slate dark:prose-invert max-w-none">
            <h1 className="text-3xl font-bold mb-2">EchoBrief Terms of Service</h1>
            <p className="text-muted-foreground mb-8">Last updated: April 2, 2026</p>

            <h2>1. Acceptance of Terms</h2>
            <p>
              By using EchoBrief ("Service"), you agree to comply with these Terms of Service. If you do not agree to these terms, please do not use the Service.
            </p>

            <h2>2. Description of Service</h2>
            <p>
              EchoBrief is an AI-powered meeting intelligence platform that:
            </p>
            <ul>
              <li>Records meetings (with user consent)</li>
              <li>Transcribes audio to text in 22 Indian languages</li>
              <li>Generates AI-powered summaries, action items, and insights</li>
              <li>Delivers reports via email or WhatsApp</li>
            </ul>

            <h2>3. User Responsibilities</h2>
            <p>
              You are responsible for:
            </p>
            <ul>
              <li>Obtaining consent from all meeting participants before recording</li>
              <li>Complying with all applicable laws and regulations (including DPDP Act 2023 in India)</li>
              <li>Maintaining confidentiality of your account credentials</li>
              <li>Not using the Service for illegal or harmful purposes</li>
            </ul>

            <h2>4. Intellectual Property</h2>
            <p>
              All content, features, and functionality of EchoBrief are owned by Oltaflock AI, protected by international copyright, trademark, and other intellectual property laws.
            </p>

            <h2>5. User Content</h2>
            <p>
              You retain all rights to content you upload. By using EchoBrief, you grant us a limited license to process and analyze your recordings for the purpose of generating summaries and insights.
            </p>

            <h2>6. Data Privacy & Security</h2>
            <p>
              We process data in compliance with the India Data Protection Act, 2023 (DPDP). All recordings and sensitive information are encrypted and stored securely. See our Privacy Policy for full details.
            </p>

            <h2>7. Limitation of Liability</h2>
            <p>
              EchoBrief and Oltaflock AI are provided "as is" without warranties. We are not liable for:
            </p>
            <ul>
              <li>Errors, omissions, or inaccuracies in AI-generated summaries</li>
              <li>Loss of data or service interruptions</li>
              <li>Indirect, incidental, or consequential damages</li>
            </ul>

            <h2>8. Prohibited Uses</h2>
            <p>
              You may not use EchoBrief to:
            </p>
            <ul>
              <li>Record meetings without participant consent</li>
              <li>Violate anyone's privacy or data protection rights</li>
              <li>Access or use the Service for unlawful purposes</li>
              <li>Attempt to reverse-engineer or access our systems</li>
              <li>Misrepresent your identity or affiliation</li>
            </ul>

            <h2>9. Indemnification</h2>
            <p>
              You agree to indemnify and hold harmless Oltaflock AI and its officers, employees, and agents from any claims, damages, or costs arising from your use of the Service or violation of these terms.
            </p>

            <h2>10. Termination</h2>
            <p>
              We may terminate or suspend your account immediately for violation of these terms. You may terminate your account at any time by contacting support.
            </p>

            <h2>11. Modifications to Terms</h2>
            <p>
              We may update these Terms of Service at any time. Continued use of EchoBrief after modifications constitutes acceptance of the updated terms.
            </p>

            <h2>12. Governing Law</h2>
            <p>
              These Terms are governed by and construed in accordance with the laws of India, without regard to conflicts of law principles.
            </p>

            <h2>13. Contact Us</h2>
            <p>
              For questions about these Terms, contact us at:
            </p>
            <ul>
              <li>Email: support@echobrief.in</li>
              <li>Website: https://echobrief.in</li>
            </ul>

            <p className="mt-8 pt-8 border-t border-muted">
              <strong>© 2026 Oltaflock AI. All rights reserved.</strong>
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
