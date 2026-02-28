import { Link } from 'react-router-dom';
import { Navbar } from '@/components/landing/Navbar';
import { Footer } from '@/components/landing/Footer';

export default function PrivacyPolicy() {
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
            <h1 className="text-3xl font-bold mb-2">EchoBrief Privacy Policy</h1>
            <p className="text-muted-foreground mb-8">Last updated: February 28, 2025</p>

            <p className="lead">
              EchoBrief (&quot;we&quot;, &quot;our&quot;, or &quot;the extension&quot;) respects your privacy and is committed to protecting your information.
            </p>
            <p>
              This Privacy Policy explains how EchoBrief collects, uses, and protects data when you use the extension.
            </p>

            <h2>1. What EchoBrief Does</h2>
            <p>
              EchoBrief is a browser extension designed to record supported web meetings when explicitly initiated by the user, generate transcripts, and provide AI-powered summaries.
            </p>
            <p>
              EchoBrief does <strong>NOT</strong> automatically record meetings. Recording begins only when the user manually clicks the Start Recording button.
            </p>

            <h2>2. Information We Collect</h2>
            <p>EchoBrief may collect the following types of information:</p>
            <h3>Meeting Audio Data</h3>
            <p>
              When recording is started by the user, EchoBrief captures audio from the meeting tab for transcription and summarization purposes. This audio is processed only to generate transcripts and summaries.
            </p>
            <h3>Generated Meeting Content</h3>
            <p>EchoBrief may store:</p>
            <ul>
              <li>Transcripts of recorded meetings</li>
              <li>AI-generated summaries</li>
              <li>Extracted action items</li>
            </ul>
            <p>This information is stored securely and is accessible only to the user.</p>
            <h3>Account Information (if applicable)</h3>
            <p>
              If you use the EchoBrief web dashboard, basic account information such as email address may be collected for authentication purposes.
            </p>

            <h2>3. How We Use Information</h2>
            <p>We use collected data only to:</p>
            <ul>
              <li>Provide transcription and AI summary services</li>
              <li>Store and display meeting insights to users</li>
              <li>Improve extension functionality</li>
            </ul>
            <p>We do <strong>NOT</strong> use data for advertising or profiling.</p>

            <h2>4. Data Sharing</h2>
            <p>EchoBrief does <strong>NOT</strong> sell, rent, or trade user data.</p>
            <p>
              Data is shared only with service providers strictly necessary to operate the service, such as:
            </p>
            <ul>
              <li>Cloud storage providers</li>
              <li>AI transcription and summarization APIs</li>
            </ul>
            <p>These providers process data solely to deliver EchoBrief functionality.</p>

            <h2>5. User Control</h2>
            <p>Users maintain full control over their data:</p>
            <ul>
              <li>Recording starts only after manual user action</li>
              <li>Users can stop recording at any time</li>
              <li>Users can delete stored data from the dashboard</li>
            </ul>

            <h2>6. Data Security</h2>
            <p>
              EchoBrief uses industry-standard security measures to protect data, including secure HTTPS communication and controlled access to stored information.
            </p>

            <h2>7. No Tracking or Monitoring</h2>
            <p>EchoBrief does <strong>NOT</strong>:</p>
            <ul>
              <li>Track browsing history</li>
              <li>Monitor user activity outside supported meeting pages</li>
              <li>Collect unrelated personal data</li>
            </ul>

            <h2>8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. Updates will be reflected on this page with a revised &quot;Last updated&quot; date.
            </p>

            <h2>9. Contact</h2>
            <p>If you have questions about this Privacy Policy, please contact:</p>
            <p>
              <a
                href="mailto:amaan@oltaflock.ai"
                className="text-accent hover:underline font-medium"
              >
                amaan@oltaflock.ai
              </a>
            </p>
          </article>
        </div>
      </main>
      <Footer />
    </div>
  );
}
