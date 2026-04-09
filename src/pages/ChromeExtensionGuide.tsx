import { Link } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { Chrome, ExternalLink, Download, Code } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Set VITE_CHROME_EXTENSION_STORE_URL in .env when the extension is published to Chrome Web Store
const CHROME_WEB_STORE_URL = import.meta.env.VITE_CHROME_EXTENSION_STORE_URL;

export default function ChromeExtensionGuide() {
  return (
    <DashboardLayout>
      <div className="p-6 md:p-8 max-w-3xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          ← Back to Dashboard
        </Link>

        <div className="space-y-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Chrome className="w-7 h-7 text-[#4285F4]" />
              EchoBrief Chrome Extension
            </h1>
            <p className="text-muted-foreground mt-2">
              Install the extension to auto-record Google Meet and Zoom Web meetings. Recordings are transcribed and summarized in EchoBrief.
            </p>
          </div>

          {CHROME_WEB_STORE_URL && (
            <div className="rounded-lg border bg-card p-6 space-y-4">
              <h2 className="font-semibold flex items-center gap-2">
                <Download className="w-5 h-5" />
                Install from Chrome Web Store
              </h2>
              <p className="text-sm text-muted-foreground">
                Download and install the EchoBrief extension with one click. Works on Google Meet and Zoom Web.
              </p>
              <Button asChild>
                <a
                  href={CHROME_WEB_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-2"
                >
                  <Chrome className="w-4 h-4" />
                  Get Extension from Chrome Web Store
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            </div>
          )}

          {!CHROME_WEB_STORE_URL && (
          <div className="rounded-lg border bg-card p-6 space-y-4">
            <h2 className="font-semibold flex items-center gap-2">
              <Code className="w-5 h-5" />
              Install Extension (Unpacked)
            </h2>
            <p className="text-sm text-muted-foreground">
              Load the extension from the project folder. Clone the EchoBrief repo and follow the steps below.
            </p>
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>
                Clone or download the EchoBrief repo and locate the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">chrome-extension</code> folder.
              </li>
              <li>
                Open Chrome and go to{' '}
                <a
                  href="chrome://extensions"
                  className="text-accent hover:underline"
                >
                  chrome://extensions
                </a>
              </li>
              <li>
                Enable <strong>Developer mode</strong> (toggle in the top-right).
              </li>
              <li>
                Click <strong>Load unpacked</strong> and select the <code className="rounded bg-muted px-1.5 py-0.5 text-xs">chrome-extension</code> folder.
              </li>
              <li>
                The EchoBrief icon will appear in your toolbar. Open a Google Meet or Zoom Web meeting and click it to start recording.
              </li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Make sure your app URL (<code className="rounded bg-muted px-1.5 py-0.5">echobrief.in</code> or <code className="rounded bg-muted px-1.5 py-0.5">localhost:8080</code>) is open so the extension can sync.
            </p>
          </div>
          )}

          <div className="rounded-lg border border-muted bg-muted/30 p-4">
            <h3 className="font-medium text-sm mb-2">Supported platforms</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Google Meet (meet.google.com)</li>
              <li>• Zoom Web (zoom.us in-browser meetings)</li>
            </ul>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
