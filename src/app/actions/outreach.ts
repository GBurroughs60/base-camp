"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

// The shared gating/logging layer every future draft-creating engine
// (catch-up, standing cadence, and eventually discovery-driven first
// touches) calls before writing a Gmail draft. Built before any of those
// engines exist so nothing gets wired up against a shaky foundation --
// see docs/outreach-engine-plan.md, sections 3 and 6.
//
// A row gets logged the moment a draft is CREATED, not once Greg has
// actually hit send in Gmail -- confirmed with Greg directly rather than
// assumed. The status column still starts at "sent" (matching the
// event_occurrences/outreach_log migration already applied), but in
// practice it means "the pipeline drafted this," not "this left the
// outbox." The point of the 30-day floor below is to stop the pipeline
// from drafting a second pitch to the same company too soon, regardless of
// whether Greg has reviewed or sent the first one yet -- so logging at
// creation time is what actually protects the relationship, and it avoids
// needing to poll the Sent folder to detect a real send (a "replied" or
// "declined" status can still be set later, by hand or by a future
// Sent/reply scan, without changing when the row itself gets created).

const RECONTACT_FLOOR_DAYS = 30;

export type RecontactEligibility =
  | { eligible: true }
  | { eligible: false; blockedUntil: string; reason: string };

// Whichever is later governs: the 30-day floor since this pipeline last
// logged a touch to this company (any status -- a reply or a decline still
// means the pipeline already reached out), or an explicit
// events.recontact_not_before date set from a real reply giving specific
// timing ("we book in February"). No prior contact and no override means
// there's nothing to wait on.
export async function checkRecontactEligibility(input: {
  companyId: string | null;
  contactId: string | null;
  eventId: string | null;
}): Promise<RecontactEligibility> {
  const supabase = await createClient();

  let lastSentAt: string | null = null;
  if (input.companyId || input.contactId) {
    let query = supabase
      .from("outreach_log")
      .select("sent_at")
      .order("sent_at", { ascending: false })
      .limit(1);
    query = input.companyId
      ? query.eq("company_id", input.companyId)
      : query.eq("contact_id", input.contactId as string);
    const { data } = await query.maybeSingle();
    lastSentAt = (data as { sent_at: string } | null)?.sent_at ?? null;
  }

  const floorDate = lastSentAt
    ? new Date(new Date(lastSentAt).getTime() + RECONTACT_FLOOR_DAYS * 24 * 60 * 60 * 1000)
    : null;

  let eventFloor: Date | null = null;
  if (input.eventId) {
    const { data } = await supabase
      .from("events")
      .select("recontact_not_before")
      .eq("id", input.eventId)
      .maybeSingle();
    const raw = (data as { recontact_not_before: string | null } | null)?.recontact_not_before;
    if (raw) eventFloor = new Date(raw);
  }

  const effective =
    [floorDate, eventFloor]
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  if (!effective || effective.getTime() <= Date.now()) {
    return { eligible: true };
  }

  return {
    eligible: false,
    blockedUntil: effective.toISOString(),
    reason:
      effective === eventFloor
        ? "A specific recontact date is set on this event from a prior reply."
        : "This company was contacted by this pipeline within the last 30 days.",
  };
}

// Records a draft-creation attempt. Callers should call
// checkRecontactEligibility first and skip the draft entirely when
// ineligible -- this function doesn't re-check on its own, so it stays a
// plain log write usable for backfills or manual entries too.
export async function logOutreach(input: {
  companyId: string | null;
  contactId: string | null;
  artistId: string | null;
  eventId: string | null;
  gmailDraftId?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  if (!input.companyId && !input.contactId) {
    return { ok: false, error: "logOutreach requires a company or a contact" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("outreach_log").insert({
    company_id: input.companyId,
    contact_id: input.contactId,
    artist_id: input.artistId,
    event_id: input.eventId,
    gmail_draft_id: input.gmailDraftId ?? null,
    notes: input.notes ?? null,
    status: "sent",
  });

  if (error) {
    return { ok: false, error: "Could not log this outreach attempt." };
  }
  return { ok: true };
}
