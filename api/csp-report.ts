import type { VercelRequest, VercelResponse } from "@vercel/node";

/**
 * CSP violation sink.
 *
 * `vercel.json` shipped a `Content-Security-Policy-Report-Only` header with no
 * `report-uri` and no `report-to`, so it blocked nothing and recorded nothing —
 * a header that only looked like a control. This gives it somewhere to report,
 * which is the prerequisite for turning it into an enforcing policy: you cannot
 * safely drop `'unsafe-inline'` until you have seen a week of real traffic.
 *
 * Browsers post here unauthenticated, by design, so it is deliberately dumb:
 * it accepts only the two report content types, caps the body, logs, and always
 * answers 204. There is nothing to enumerate and nothing to exhaust.
 */

// Chrome's report bodies are well under 10 KB; anything larger is not a report.
const MAX_BODY_BYTES = 10_000;

const REPORT_CONTENT_TYPES = [
  "application/csp-report", // the original report-uri format
  "application/reports+json", // the Reporting API format
  "application/json",
];

interface CspReportBody {
  "document-uri"?: string;
  "violated-directive"?: string;
  "effective-directive"?: string;
  "blocked-uri"?: string;
  "line-number"?: number;
  "script-sample"?: string;
}

function summarise(report: CspReportBody): string {
  const directive = report["effective-directive"] || report["violated-directive"] || "?";
  const blocked = report["blocked-uri"] || "?";
  const doc = report["document-uri"] || "?";
  const line = report["line-number"];
  return `${directive} blocked ${blocked} on ${doc}${line ? `:${line}` : ""}`;
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Always 204, including for the wrong method: a violation report is
  // fire-and-forget and the browser does nothing with the status anyway.
  if (req.method !== "POST") {
    res.status(204).end();
    return;
  }

  const contentType = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!REPORT_CONTENT_TYPES.includes(contentType)) {
    res.status(204).end();
    return;
  }

  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
    if (raw.length > MAX_BODY_BYTES) {
      console.warn("[csp] oversized report dropped:", raw.length);
      res.status(204).end();
      return;
    }

    const parsed = typeof req.body === "string" ? JSON.parse(raw) : req.body;

    // report-uri sends { "csp-report": {...} }; the Reporting API sends an
    // array of { type, body }. Normalise both to a list of report bodies.
    const reports: CspReportBody[] = Array.isArray(parsed)
      ? parsed.filter((r) => r?.type === "csp-violation").map((r) => r.body ?? {})
      : [parsed?.["csp-report"] ?? parsed ?? {}];

    for (const report of reports) {
      console.warn("[csp]", summarise(report));
    }
  } catch (err) {
    console.warn("[csp] unparseable report:", err instanceof Error ? err.message : String(err));
  }

  res.status(204).end();
}
