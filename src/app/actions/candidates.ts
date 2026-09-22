"use server";

import { createClient } from "@/lib/supabase/server";
import { createRecord, addContactAssociation } from "./records";

type ActionResult = { ok: true } | { ok: false; error: string };

// Turns a reviewed candidate into a real contact, in one action so the
// candidate's status/contact_id can never be left stale afterward -- the
// exact gap Greg ran into after the first digest (no way to mark a
// candidate handled once it's been added). Reuses createRecord("contacts",
// ...) as-is for the actual contact creation -- same whitelist,
// required-field check, and friendly duplicate-email error as the Contacts
// page's own "+ New" flow -- rather than writing a second, parallel insert
// path.
export async function addCandidateToBaseCamp(
  candidateId: string,
  input: {
    fullName: string;
    email: string | null;
    phone: string | null;
    title?: string | null;
    companyId: string | null;
    eventId: string | null;
  }
): Promise<ActionResult> {
  if (!input.fullName.trim()) {
    return { ok: false, error: "Name is required" };
  }

  const created = await createRecord("contacts", {
    full_name: input.fullName,
    email: input.email || null,
    phone: input.phone || null,
    title: input.title || null,
    company_id: input.companyId || null,
  });
  if (!created.ok) return created;

  if (input.eventId) {
    // Best-effort -- the contact is already created at this point, and a
    // failed association shouldn't block marking the candidate imported;
    // the reviewer can always link the event by hand from the new
    // contact's page.
    await addContactAssociation("event", created.data.id, input.eventId).catch(() => {});
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ status: "imported", contact_id: created.data.id })
    .eq("id", candidateId);

  if (error) {
    return {
      ok: false,
      error:
        "Contact was created, but the candidate row couldn't be marked imported -- dismiss it by hand so it doesn't reappear in the review list.",
    };
  }

  return { ok: true };
}

// Marks a candidate reviewed-and-skipped -- the row stays in the table
// (times_seen keeps bumping if the address turns up again) but drops off
// the status = "new" review list for good.
export async function dismissCandidate(candidateId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("candidates")
    .update({ status: "dismissed" })
    .eq("id", candidateId);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
