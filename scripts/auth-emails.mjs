/**
 * Supabase Auth email templates — rendered from the one brand shell.
 *
 * The auth mails (password reset, invite, confirm, magic link, email change,
 * reauthentication) are the only emails we send that do NOT live in an edge
 * function: Supabase Auth stores their HTML in project config and renders it
 * itself. That is why they quietly stayed on the pre-Warm-Dispatch palette
 * (navy #1a1a2e, Tailwind orange #f97316) long after everything else moved —
 * nothing in this repo touched them, so nothing flagged them.
 *
 * Now they are generated here from supabase/functions/_shared/email-brand.ts,
 * the same module the summary mail uses, and checked into supabase/auth-emails/
 * so `npm run brand:check` sees them like any other file.
 *
 *   node scripts/auth-emails.mjs           # render to supabase/auth-emails/
 *   node scripts/auth-emails.mjs --push    # render, then PATCH the live project
 *
 * --push needs a Management API token: SUPABASE_ACCESS_TOKEN, or the one the
 * CLI already stores in the macOS keychain (read automatically).
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_URL,
  BODY,
  C,
  MONO,
  emailShell,
  panel,
  paragraph,
  row,
} from '../supabase/functions/_shared/email-brand.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'supabase', 'auth-emails');
const PROJECT_REF = 'lekkpfpojlspbuwrtmzt';

/** Supabase renders Go templates — these placeholders must survive verbatim. */
const URL_VAR = '{{ .ConfirmationURL }}';

/** The reassurance line every credential mail needs, in the same voice. */
const ignoreLine = (what) =>
  `<p style="margin:0;font-family:${BODY};font-size:13px;line-height:1.55;color:${C.inkSoft};">${what}</p>`;

/** Link fallback, because a fair share of clients mangle the button. */
const fallback = `
              <p style="margin:14px 0 0;font-family:${BODY};font-size:12px;line-height:1.55;color:${C.inkFaint};">
                If the button does not work, paste this into your browser:<br>
                <span style="font-family:${MONO};font-size:11px;color:${C.inkSoft};word-break:break-all;">${URL_VAR}</span>
              </p>`;

const linkMail = ({ eyebrow, headline, body, cta, note, expires = '1 hour' }) =>
  emailShell({
    eyebrow,
    headline,
    bodyRows: [
      row(panel(body.map((p) => paragraph(p, C.ink)).join('')), '20px 28px 22px'),
      row(`${ignoreLine(note)}${fallback}`, '0 28px 22px'),
    ].join(''),
    cta: { href: URL_VAR, label: cta },
    ctaNote: `This link expires in ${expires} and can be used once.`,
    signoff: 'Sent by',
    footerLink: { href: APP_URL, label: 'echobrief.in' },
  });

export const TEMPLATES = {
  recovery: {
    subject: 'Reset your password',
    html: linkMail({
      eyebrow: 'Password reset',
      headline: 'Set a new password',
      body: [
        'Somebody asked to reset the password on your EchoBrief account. Use the button below to choose a new one.',
      ],
      cta: 'Set a new password',
      note: 'If that was not you, ignore this email — your current password still works and nothing has changed.',
    }),
  },
  confirmation: {
    subject: 'Verify your email',
    html: linkMail({
      eyebrow: 'Confirm your email',
      headline: 'Verify your email address',
      body: [
        'Confirm this address and your EchoBrief account is ready — send a bot to a meeting and the summary lands back here.',
      ],
      cta: 'Verify email address',
      note: 'If you did not create an EchoBrief account, you can ignore this email.',
      expires: '24 hours',
    }),
  },
  invite: {
    subject: "You've been invited to EchoBrief",
    html: linkMail({
      eyebrow: 'Invitation',
      headline: "You've been invited",
      body: [
        'You have been invited to EchoBrief — a bot joins your meetings, transcribes them, and emails you the summary, decisions and action items afterwards.',
        'Accept the invitation to set a password and sign in.',
      ],
      cta: 'Accept the invitation',
      note: 'If you were not expecting this invitation, you can ignore this email.',
      expires: '24 hours',
    }),
  },
  magic_link: {
    subject: 'Your sign-in link',
    html: linkMail({
      eyebrow: 'Sign in',
      headline: 'Your sign-in link',
      body: ['Use the button below to sign in to EchoBrief. No password needed.'],
      cta: 'Sign in to EchoBrief',
      note: 'If you did not ask to sign in, ignore this email — the link only works from this message.',
    }),
  },
  email_change: {
    subject: 'Confirm your new email address',
    html: linkMail({
      eyebrow: 'Email change',
      headline: 'Confirm your new address',
      body: [
        'You asked to change the email address on your EchoBrief account from {{ .Email }} to {{ .NewEmail }}. Confirm it to finish the change.',
        'Meeting summaries go to the new address once this is confirmed.',
      ],
      cta: 'Confirm the change',
      note: 'If you did not request this, ignore this email and the address stays as it is.',
      expires: '24 hours',
    }),
  },
  reauthentication: {
    subject: "Confirm it's you",
    html: emailShell({
      eyebrow: 'Security check',
      headline: "Confirm it's you",
      bodyRows: [
        row(
          panel(
            paragraph('Enter this code to confirm the action you started in EchoBrief.', C.ink) +
              `<div style="font-family:${MONO};font-size:30px;font-weight:600;letter-spacing:0.18em;color:${C.ink};padding-top:6px;">{{ .Token }}</div>`,
          ),
          '20px 28px 22px',
        ),
        row(
          ignoreLine('If you did not start this, ignore this email and change your password.'),
          '0 28px 22px',
        ),
      ].join(''),
      ctaNote: 'The code expires in 1 hour.',
      signoff: 'Sent by',
      footerLink: { href: APP_URL, label: 'echobrief.in' },
    }),
  },
};

function render() {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [name, { html }] of Object.entries(TEMPLATES)) {
    writeFileSync(join(OUT_DIR, `${name}.html`), `${html}\n`);
  }
  console.log(`✓ rendered ${Object.keys(TEMPLATES).length} auth templates → supabase/auth-emails/`);
}

function accessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN;
  try {
    const raw = execFileSync('security', ['find-generic-password', '-s', 'Supabase CLI', '-w'], {
      encoding: 'utf8',
    }).trim();
    const b64 = raw.replace(/^go-keyring-base64:/, '');
    return raw.startsWith('go-keyring-base64:') ? Buffer.from(b64, 'base64').toString('utf8') : raw;
  } catch {
    throw new Error('No Management API token — set SUPABASE_ACCESS_TOKEN or run `supabase login`.');
  }
}

async function push() {
  const token = accessToken();
  const body = {};
  for (const [name, { subject, html }] of Object.entries(TEMPLATES)) {
    body[`mailer_templates_${name}_content`] = html;
    body[`mailer_subjects_${name}`] = subject;
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH failed: ${res.status} ${await res.text()}`);

  // Read back rather than trusting the PATCH response: this API has already
  // been caught clearing a whole field group on a partial write (see
  // docs/operations.md on smtp_*).
  const check = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  }).then((r) => r.json());

  for (const [name, { subject, html }] of Object.entries(TEMPLATES)) {
    const liveHtml = check[`mailer_templates_${name}_content`];
    const liveSubject = check[`mailer_subjects_${name}`];
    const ok = liveHtml === html && liveSubject === subject;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — live copy does not match'}`);
    if (!ok) process.exitCode = 1;
  }
}

render();
if (process.argv.includes('--push')) await push();
