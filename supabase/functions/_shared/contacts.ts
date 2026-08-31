/**
 * Contacts: external attendees become people the workspace knows.
 *
 * Every external attendee (email domain ≠ owner's) of a completed meeting is
 * upserted into `contacts` and linked through `meeting_contacts`, so a rep can
 * open "Mathew Ryan / Ryan & Co Travel" and see every meeting, number and
 * commitment attached to him — and read a rolling account brief before the
 * next call. Derivation is pure (tested); persistence never throws.
 */
import { Attendee, externalAttendees, ownerDomain } from "./zones.ts";
import { GENERIC_DOMAINS } from "./vocab.ts";

export interface DerivedContact {
  email: string;
  name: string | null;
  company: string | null;
  domain: string;
}

function cap(w: string): string {
  return w ? w[0].toUpperCase() + w.slice(1) : w;
}

/** External attendees → contact rows. Company is guessed from the domain root. */
export function deriveContacts(attendees: Attendee[] | null | undefined): DerivedContact[] {
  const domain = ownerDomain(attendees);
  const seen = new Set<string>();
  const out: DerivedContact[] = [];
  for (const a of externalAttendees(attendees, domain)) {
    const email = String(a.email ?? "").trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    const [local, dom] = email.split("@");
    const root = dom.split(".")[0] ?? "";
    const displayName = String(a.displayName ?? "").trim();
    const name = displayName ||
      (local ? local.split(/[._\-+]/).filter(Boolean).map(cap).join(" ") : null);
    out.push({
      email,
      name: name || null,
      company: root && !GENERIC_DOMAINS.has(root) ? cap(root) : null,
      domain: dom,
    });
  }
  return out;
}

/**
 * Upsert the meeting's external attendees as contacts and link them. Counts
 * a meeting once per contact even if the pipeline reruns. Returns contact ids.
 */
export async function upsertMeetingContacts(
  supabase: any,
  meeting: Record<string, any>,
): Promise<string[]> {
  const ids: string[] = [];
  try {
    const derived = deriveContacts(meeting.attendees ?? []);
    if (derived.length === 0) return ids;
    const seenAt = meeting.start_time || new Date().toISOString();

    for (const c of derived) {
      const { data: existing } = await supabase
        .from("contacts")
        .select("id, name, company, first_seen_at, last_seen_at, meeting_count")
        .eq("user_id", meeting.user_id)
        .eq("email", c.email)
        .maybeSingle();

      let contactId: string;
      if (existing) {
        contactId = existing.id;
      } else {
        const { data: inserted, error } = await supabase
          .from("contacts")
          .insert({
            user_id: meeting.user_id,
            email: c.email,
            name: c.name,
            company: c.company,
            domain: c.domain,
            first_seen_at: seenAt,
            last_seen_at: seenAt,
            meeting_count: 0,
          })
          .select("id")
          .single();
        if (error || !inserted) {
          console.warn(`[contacts] insert failed for ${c.email}:`, error?.message);
          continue;
        }
        contactId = inserted.id;
      }

      const { data: link } = await supabase
        .from("meeting_contacts")
        .select("meeting_id")
        .eq("meeting_id", meeting.id)
        .eq("contact_id", contactId)
        .maybeSingle();

      if (!link) {
        await supabase.from("meeting_contacts").insert({
          meeting_id: meeting.id,
          contact_id: contactId,
          user_id: meeting.user_id,
        });
        const prevFirst = existing?.first_seen_at ? new Date(existing.first_seen_at).getTime() : Infinity;
        const prevLast = existing?.last_seen_at ? new Date(existing.last_seen_at).getTime() : -Infinity;
        const t = new Date(seenAt).getTime();
        await supabase
          .from("contacts")
          .update({
            meeting_count: (existing?.meeting_count ?? 0) + 1,
            first_seen_at: t < prevFirst ? seenAt : existing?.first_seen_at ?? seenAt,
            last_seen_at: t > prevLast ? seenAt : existing?.last_seen_at ?? seenAt,
            // Fill a name/company we did not have before; never overwrite a user edit.
            ...(existing && !existing.name && c.name ? { name: c.name } : {}),
            ...(existing && !existing.company && c.company ? { company: c.company } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", contactId);
      }
      ids.push(contactId);
    }
  } catch (err) {
    console.warn("[contacts] upsert failed (non-fatal):", err);
  }
  return ids;
}
