/**
 * The one email shell.
 *
 * Every mail EchoBrief sends — the meeting summary, the emailed report, the
 * monitor alert, and the Supabase Auth mails (password reset, invite, confirm,
 * magic link, email change) — is built from this file, so they read as one
 * product rather than five eras of one.
 *
 * Colours are the flat, pre-composited values from the `email` block of
 * brand/tokens/colors.json: mail clients support neither CSS variables nor
 * color-mix(), so the tints have to be baked. Type is the BRAND stack from
 * brand/TYPOGRAPHY.md — DM Serif Display for display, Manrope for body, IBM
 * Plex Mono for eyebrows. (The app stack, Switzer + JetBrains Mono, is for the
 * dashboard; using it in mail is off-brand.) Do not eyeball a new hex here —
 * add it to brand/tokens/colors.json first, or `npm run brand:check` fails.
 *
 * This module is deliberately plain, erasable TypeScript with no imports: it is
 * loaded by Deno inside the edge functions AND by Node in
 * scripts/auth-emails.mjs, which renders the Supabase Auth templates from these
 * same tokens.
 */

/** Warm Dispatch, flattened for mail clients. brand/tokens/colors.json */
export const C = {
  ember: "#D93F0B",
  emberDeep: "#B83508", // the only ember safe for small text on paper
  emberInk: "#8C2F05",
  gold: "#F5C842",
  goldInk: "#8A6400",
  paper: "#FAF4EF",
  paperCard: "#FEFBF8",
  ink: "#190F0B",
  inkMid: "#514540",
  inkSoft: "#827873",
  inkFaint: "#AAA39F",
  rule: "#E0D5CF",
  ruleSoft: "#EFE6E0",
  emberTint: "#F8E7DF", // ember-7-on-paper
  emberTintEdge: "#F3CCBD", // ember-22-on-paper
  goldTint: "#F9EFDA", // gold-12-on-paper
  ok: "#479C4D",
  warn: "#D6A20A",
  stop: "#D7352D",
};

export const GRADIENT = `linear-gradient(135deg, ${C.ember} 0%, ${C.gold} 100%)`;

export const SERIF = "'DM Serif Display',Georgia,'Times New Roman',serif";
export const BODY = "'Manrope',-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";
export const MONO = "'IBM Plex Mono',Consolas,'Courier New',monospace";

export const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">';

export const APP_URL = "https://echobrief.in";
export const LOCKUP = "https://www.echobrief.in/echobrief-lockup-light.png";

/** Text from models, users and error payloads all end up in this HTML. */
export function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Eyebrow above a block: mono, small, tracked out, with the gradient tick. */
export function sectionHeading(label: string): string {
  return `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td width="3" style="background:${GRADIENT};background-color:${C.ember};border-radius:2px;">&nbsp;</td>
                  <td style="padding-left:10px;font-family:${MONO};font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkSoft};">${escapeHtml(label)}</td>
                </tr>
              </table>`;
}

/** A full-width padded row — the unit every mail's body is assembled from. */
export function row(inner: string, padding = "0 28px 26px"): string {
  return `
          <tr>
            <td style="padding:${padding};">
              ${inner}
            </td>
          </tr>`;
}

/** Heading + content, the standard section. */
export function section(label: string, inner: string): string {
  return row(`${sectionHeading(label)}
              <div style="height:12px;line-height:12px;font-size:0;">&nbsp;</div>
              ${inner}`);
}

/** The tinted panel used for the one thing the reader must not miss. */
export function panel(
  innerHtml: string,
  tone: "ember" | "gold" | "plain" = "ember",
): string {
  const fill = tone === "gold" ? C.goldTint : tone === "plain" ? C.paper : C.emberTint;
  const edge = tone === "gold" ? C.goldTint : tone === "plain" ? C.rule : C.emberTintEdge;
  return `
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr><td style="background-color:${fill};border:1px solid ${edge};border-radius:12px;padding:16px 18px;">
                  ${innerHtml}
                </td></tr>
              </table>`;
}

/** The single primary action. One per mail — a second button is a redesign. */
export function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;background:${GRADIENT};background-color:${C.ember};color:#FFFFFF;text-decoration:none;padding:13px 32px;border-radius:12px;font-family:${BODY};font-weight:600;font-size:14px;">${escapeHtml(label)}</a>`;
}

/** Body copy at the shell's default size. */
export function paragraph(html: string, color: string = C.inkMid): string {
  return `<p style="margin:0 0 12px;font-family:${BODY};font-size:15px;line-height:1.6;color:${color};">${html}</p>`;
}

export interface ShellOptions {
  /** <title>, and the mono eyebrow over the headline. */
  eyebrow: string;
  /** The serif display line. */
  headline: string;
  /** Optional meta line under the headline (date, recipient, signature). */
  meta?: string;
  /** Pre-built <tr> rows — use row()/section()/etc. */
  bodyRows: string;
  /** Optional centred CTA at the foot of the body. */
  cta?: { href: string; label: string };
  /** Small print under the CTA. */
  ctaNote?: string;
  /**
   * The verb in the footer sign-off. Defaults to the meeting-mail line;
   * credential mail says "Sent by", because nothing was recorded or summarised.
   */
  signoff?: string;
  /** Replaces the default "Notification settings" link when set. */
  footerLink?: { href: string; label: string };
  /** Hides the footer link entirely (internal mail — alerts). */
  hideFooterLink?: boolean;
}

/**
 * Wraps rows in the shell every EchoBrief mail shares: gradient hairline, the
 * lockup, eyebrow + serif headline, and the signed-off footer.
 */
export function emailShell(o: ShellOptions): string {
  const footerLink = o.hideFooterLink
    ? ""
    : `
              <p style="margin:6px 0 0;font-family:${BODY};font-size:12px;">
                <a href="${o.footerLink?.href ?? `${APP_URL}/settings`}" style="color:${C.inkFaint};text-decoration:underline;">${escapeHtml(o.footerLink?.label ?? "Notification settings")}</a>
              </p>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(o.headline)}</title>
  ${FONT_LINK}
</head>
<body style="margin:0;padding:0;background-color:${C.paper};font-family:${BODY};">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:${C.paper};padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;background-color:${C.paperCard};border:1px solid ${C.rule};border-radius:16px;overflow:hidden;">

          <tr><td style="height:4px;line-height:4px;font-size:0;background:${GRADIENT};background-color:${C.ember};">&nbsp;</td></tr>

          <tr>
            <td style="padding:24px 28px 0;">
              <img src="${LOCKUP}" width="150" height="57" alt="EchoBrief" style="display:block;border:0;outline:none;width:150px;height:auto;">
            </td>
          </tr>

          <tr>
            <td style="padding:22px 28px 0;">
              <div style="font-family:${MONO};font-size:11px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:${C.inkFaint};">${escapeHtml(o.eyebrow)}</div>
              <h1 style="margin:8px 0 0;font-family:${SERIF};font-size:30px;font-weight:400;line-height:1.2;color:${C.ink};">${escapeHtml(o.headline)}</h1>
              ${o.meta ? `<p style="margin:8px 0 0;font-family:${BODY};font-size:13px;color:${C.inkSoft};">${o.meta}</p>` : ""}
            </td>
          </tr>
${o.bodyRows}
${
    o.cta
      ? `
          <tr>
            <td align="center" style="padding:6px 28px 10px;">
              ${button(o.cta.href, o.cta.label)}
            </td>
          </tr>`
      : ""
  }
${
    o.ctaNote
      ? `
          <tr>
            <td align="center" style="padding:0 40px 30px;">
              <p style="margin:0;font-family:${BODY};font-size:12px;line-height:1.5;color:${C.inkFaint};">${o.ctaNote}</p>
            </td>
          </tr>`
      : `
          <tr><td style="height:20px;line-height:20px;font-size:0;">&nbsp;</td></tr>`
  }

          <tr>
            <td align="center" style="padding:18px 28px;background-color:${C.paper};border-top:1px solid ${C.ruleSoft};">
              <p style="margin:0;font-family:${BODY};font-size:12px;color:${C.inkSoft};">${escapeHtml(o.signoff ?? "Recorded and summarised by")} <span style="font-family:${SERIF};color:${C.ink};">echo<span style="font-style:italic;color:${C.emberDeep};">brief</span></span></p>${footerLink}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
