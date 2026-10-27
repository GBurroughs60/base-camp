"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

// Server actions for the Action List (docs/outreach-engine-plan.md section
// 2a) -- the in-app replacement for the old Gmail-draft Catch-up/Standing-
// Cadence engines. Three things live here: completing an item (which, for
// an "auto" row only, also logs a real outreach_log touch), dismissing an
// item for a chosen duration (with the multi-occurrence safety check for
// long dismisses), and creating a freeform "manual" task.

const DAY_MS = 24 * 60 * 60 * 1000;
const MULTI_OCCURRENCE_CHECK_THRESHOLD_DAYS = 90;

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

// -----------------------------------------------------------------------
// Mark complete
// -----------------------------------------------------------------------

// For an "auto" (event-linked) row, also writes a real outreach_log row so
// the existing 30-day recontact floor and outreach history keep working
// exactly as they do for every other source. For a "manual" task,
// completing it is just that -- a finished to-do, not a claim that
// outreach happened -- so no outreach_log row gets written even if the
// task happens to be linked to an event. artistIds is optional either
// way: filled in only if Greg already knows who he pitched.
//
// Multi-artist (2026-10-27, per Greg): more than one artist is sometimes
// genuinely pitched for the same event/venue in one sitting, so this
// writes one outreach_log row per artist in artistIds rather than a
// single row with one artist_id. Safe to do because the 30-day recontact
// floor (checkRecontactEligibility, outreach.ts) keys only on
// company_id/contact_id, never artist_id -- writing several rows for the
// same touch never creates multiple separate floors. Zero artists still
// writes exactly one row with artist_id null, same as the original
// single-artist design. action_items.outreach_log_id keeps pointing at
// just the first row written, not all of them -- full per-artist
// traceability lives in outreach_log itself, queryable by event_id.
export async function completeActionItem(
  id: string,
  artistIds?: (string | null)[] | null
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: item, error: fetchError } = await supabase
    .from("action_items")
    .select("id, source, status, event_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !item) {
    return { ok: false, error: "Could not find this action item." };
  }
  if (item.status !== "open") {
    return { ok: false, error: "This item has already been handled." };
  }

  let outreachLogId: string | null = null;

  if (item.source === "auto") {
    if (!item.event_id) {
      return { ok: false, error: "This item has no event to log outreach against." };
    }
    const { data: event, error: eventError } = await supabase
      .from("events")
      .select("venue_id, primary_contact_id")
      .eq("id", item.event_id)
      .maybeSingle();
    if (eventError) {
      return { ok: false, error: "Could not load the event for this item." };
    }

    const cleanedArtistIds = (artistIds ?? []).filter((a): a is string => Boolean(a));
    const idsToLog: (string | null)[] = cleanedArtistIds.length > 0 ? cleanedArtistIds : [null];

    const { data: logRows, error: logError } = await supabase
      .from("outreach_log")
      .insert(
        idsToLog.map((artistId) => ({
          company_id: event?.venue_id ?? null,
          contact_id: event?.primary_contact_id ?? null,
          artist_id: artistId,
          event_id: item.event_id,
          status: "sent",
        }))
      )
      .select("id");

    if (logError || !logRows || logRows.length === 0) {
      return { ok: false, error: "Could not log this outreach touch." };
    }
    outreachLogId = logRows[0].id as string;
  }

  const { error: updateError } = await supabase
    .from("action_items")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      outreach_log_id: outreachLogId,
    })
    .eq("id", id)
    .eq("status", "open");

  if (updateError) {
    return { ok: false, error: "Could not mark this item complete." };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Dismiss
// -----------------------------------------------------------------------

export type DismissTarget = { kind: "preset"; days: number } | { kind: "custom"; date: string };

export type DismissResult =
  | { ok: true; hiddenUntil: string; capped: false }
  | { ok: true; hiddenUntil: string; capped: true; capReason: string }
  | { ok: false; error: string };

// Sets hidden_until on the row; status always stays 'open' -- nothing
// about the event or its occurrence is touched. For a target 90+ days
// out on an event-linked ("auto") row, checks event_occurrences for
// another occurrence of the same event later than the one being
// dismissed but earlier than the requested target -- if found, caps
// hidden_until to that date instead, so a long dismiss on one instance
// (e.g. a spring date) can't bury a nearer one (e.g. that same series'
// fall date) already on file. See docs/outreach-engine-plan.md section
// 2a, "Multi-occurrence check."
export async function dismissActionItem(id: string, target: DismissTarget): Promise<DismissResult> {
  const supabase = await createClient();

  const { data: item, error: fetchError } = await supabase
    .from("action_items")
    .select("id, source, status, event_id, occurrence_date")
    .eq("id", id)
    .maybeSingle();

  if (fetchError || !item) {
    return { ok: false, error: "Could not find this action item." };
  }
  if (item.status !== "open") {
    return { ok: false, error: "This item has already been handled." };
  }

  const today = todayDateOnly();
  const requestedDate =
    target.kind === "preset"
      ? new Date(today.getTime() + target.days * DAY_MS)
      : toDateOnly(target.date);

  if (requestedDate.getTime() <= today.getTime()) {
    return { ok: false, error: "Pick a date in the future." };
  }

  const requestedDurationDays = Math.round((requestedDate.getTime() - today.getTime()) / DAY_MS);

  let hiddenUntil = requestedDate;
  let capped = false;
  let capReason = "";

  if (
    item.source === "auto" &&
    item.event_id &&
    item.occurrence_date &&
    requestedDurationDays >= MULTI_OCCURRENCE_CHECK_THRESHOLD_DAYS
  ) {
    const { data: laterOccurrence } = await supabase
      .from("event_occurrences")
      .select("occurrence_date")
      .eq("event_id", item.event_id)
      .gt("occurrence_date", item.occurrence_date)
      .lte("occurrence_date", toDateOnlyString(requestedDate))
      .order("occurrence_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (laterOccurrence?.occurrence_date) {
      hiddenUntil = toDateOnly(laterOccurrence.occurrence_date as string);
      capped = true;
      capReason = `This event also has a ${laterOccurrence.occurrence_date} date on file — bringing this back then instead, so that one doesn't get buried.`;
    }
  }

  const hiddenUntilStr = toDateOnlyString(hiddenUntil);

  const { error: updateError } = await supabase
    .from("action_items")
    .update({ hidden_until: hiddenUntilStr })
    .eq("id", id)
    .eq("status", "open");

  if (updateError) {
    return { ok: false, error: "Could not dismiss this item." };
  }

  return capped
    ? { ok: true, hiddenUntil: hiddenUntilStr, capped: true, capReason }
    : { ok: true, hiddenUntil: hiddenUntilStr, capped: false };
}

// -----------------------------------------------------------------------
// Custom tasks
// -----------------------------------------------------------------------

export async function createManualTask(input: {
  title: string;
  notes?: string | null;
  dueDate?: string | null;
  eventId?: string | null;
  companyId?: string | null;
  contactId?: string | null;
  artistId?: string | null;
}): Promise<ActionResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, error: "Title is required." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("action_items").insert({
    source: "manual",
    title,
    notes: input.notes?.trim() || null,
    due_date: input.dueDate || null,
    event_id: input.eventId || null,
    company_id: input.companyId || null,
    contact_id: input.contactId || null,
    artist_id: input.artistId || null,
  });

  if (error) {
    return { ok: false, error: "Could not create this task." };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------
// Linking search (New Task's optional "link to a record" field)
// -----------------------------------------------------------------------

export type LinkableKind = "event" | "company" | "contact" | "artist";

const LINKABLE_TABLE: Record<LinkableKind, string> = {
  event: "events",
  company: "companies",
  contact: "contacts",
  artist: "artists",
};
const LINKABLE_NAME_COL: Record<LinkableKind, string> = {
  event: "name",
  company: "name",
  contact: "full_name",
  artist: "name",
};

// Deliberately separate from records.ts's searchRecords/SearchTable (which
// drives RelationSearchPicker's heavier search-or-create flow elsewhere in
// the app) -- a task's link is optional context, not data entry, so this
// is just search, no "+ Create new" branch, and it covers artists too
// (which SearchTable doesn't).
export async function searchLinkableRecords(
  kind: LinkableKind,
  query: string
): Promise<{ id: string; label: string; sublabel: string | null }[]> {
  const supabase = await createClient();
  const table = LINKABLE_TABLE[kind];
  const nameCol = LINKABLE_NAME_COL[kind];
  const extraCols = kind === "company" ? ", city, state" : "";

  let q = supabase
    .from(table)
    .select(`id, ${nameCol}${extraCols}`)
    .order(nameCol)
    .limit(20);

  // Same "hide what's deliberately hidden elsewhere" convention as
  // searchRecords -- archived/pending-review rows shouldn't surface as a
  // linkable record for a brand-new task.
  if (kind === "company" || kind === "event") {
    q = q.eq("archived", false).eq("pending_state_review", false);
  } else if (kind === "artist") {
    q = q.eq("archived", false);
  }

  if (query.trim()) {
    q = q.ilike(nameCol, `%${query.trim()}%`);
  }

  const { data } = await q;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const sub = kind === "company" ? [r.city, r.state].filter(Boolean).join(", ") || null : null;
    return { id: r.id as string, label: r[nameCol] as string, sublabel: sub };
  });
}
