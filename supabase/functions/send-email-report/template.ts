/**
 * Markup for the report a user forwards from the meeting page.
 *
 * Split out of index.ts so it can be rendered and tested without the module's
 * serve() call binding a port — the same split send-meeting-email uses.
 */
import { formatISTDate } from "../_shared/time.ts";
import {
  APP_URL,
  BODY,
  C,
  emailShell,
  escapeHtml,
  MONO,
  panel,
  row,
  section,
} from "../_shared/email-brand.ts";

export /**
 * The report a user emails to somebody else from the meeting page.
 *
 * Same shell as the automatic summary (_shared/email-brand.ts) — this used to
 * be a separate design with its own fonts, its own header gradient and a dead
 * *.vercel.app link in the footer, which is exactly the drift the shared shell
 * exists to stop. Content differs from the digest on purpose: whoever was sent
 * this may never have seen the meeting, so key points stay in.
 */
function generateEmailHTML(insights: any, meeting: any): string {
  const esc = escapeHtml
  const summary = insights.summary_short || ''
  const keyPoints = Array.isArray(insights.key_points) ? insights.key_points.slice(0, 5) : []
  const decisions = Array.isArray(insights.decisions) ? insights.decisions.slice(0, 3) : []
  const actionItems = Array.isArray(insights.action_items) ? insights.action_items.slice(0, 5) : []

  const bullet = (content: string, accent: string) => `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-bottom:8px;">
                <tr>
                  <td width="3" style="background-color:${accent};border-radius:2px 0 0 2px;">&nbsp;</td>
                  <td style="background-color:${C.paperCard};border:1px solid ${C.rule};border-left:none;border-radius:0 8px 8px 0;padding:12px 14px;font-family:${BODY};font-size:14px;line-height:1.55;color:${C.inkMid};">${content}</td>
                </tr>
              </table>`

  const keyPointsHtml = keyPoints
    .map((point: unknown) => bullet(esc(point), C.ember))
    .join('')

  const decisionsHtml = decisions
    .map((d: any) => bullet(esc(typeof d === 'string' ? d : d?.decision ?? ''), C.ember))
    .join('')

  const actionItemsHtml = actionItems
    .map((item: any) => {
      const task = typeof item === 'string' ? item : item.task || ''
      const owner = typeof item === 'object' && item.owner ? item.owner : null
      const priority = typeof item === 'object' && item.priority ? item.priority : null
      const ownerHtml = owner
        ? `<div style="margin-top:5px;font-family:${BODY};font-size:12px;color:${C.inkSoft};">Owner: <span style="color:${C.emberDeep};font-weight:600;">${esc(owner)}</span></div>`
        : ''
      const priorityHtml = priority
        ? ` <span style="font-family:${MONO};font-size:10px;font-weight:600;letter-spacing:0.08em;color:${priorityColor(priority)};">${esc(String(priority).toUpperCase())}</span>`
        : ''
      return bullet(
        `<span style="color:${C.ink};font-weight:600;">${esc(task)}</span>${priorityHtml}${ownerHtml}`,
        C.gold,
      )
    })
    .join('')

  return emailShell({
    eyebrow: 'Meeting report',
    headline: meeting.title,
    meta: esc(
      formatISTDate(meeting.start_time, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    ),
    bodyRows: [
      summary
        ? row(
          panel(
            `<p style="margin:0;font-family:${BODY};font-size:15px;line-height:1.6;color:${C.ink};">${esc(summary)}</p>`,
          ),
          '20px 28px 26px',
        )
        : '',
      keyPointsHtml ? section('Key points', keyPointsHtml) : '',
      decisionsHtml ? section('Decisions', decisionsHtml) : '',
      actionItemsHtml ? section('Action items', actionItemsHtml) : '',
    ].join(''),
    cta: { href: `${APP_URL}/meeting/${meeting.id}`, label: 'Open the full report' },
    ctaNote: 'The transcript, timeline and the rest of the analysis are on the report page.',
  })
}

export function priorityColor(priority: string): string {
  switch (String(priority).toLowerCase()) {
    case 'high': return C.stop
    case 'medium': return C.warn
    case 'low': return C.ok
    default: return C.inkSoft
  }
}
