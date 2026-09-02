"use server";

import { createClient } from "@/lib/supabase/server";
import { sendApprovalEmail } from "@/lib/approvalEmail";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

export type TableName = "contacts" | "companies" | "events" | "plays" | "artists";

// Whitelist of columns each table allows editing/creating through the
// generic inline-edit and quick-create UI. This is the single source of
// truth that keeps client-driven writes from touching columns we don't
// want exposed this way (raw_import, created_at, id, etc).
const EDITABLE_FIELDS: Record<TableName, Set<string>> = {
  contacts: new Set(["full_name", "email", "phone", "title", "notes", "company_id"]),
  companies: new Set([
    "name",
    "type",
    "city",
    "state",
    "country",
    "phone",
    "website",
    "notes",
    "capacity",
    "is_indoor",
    "is_outdoor",
    "archived",
  ]),
  events: new Set([
    "name",
    "city",
    "state",
    "country",
    "website",
    "is_public",
    "venue_id",
    "primary_contact_id",
    "notes",
    "archived",
  ]),
  plays: new Set([
    "show_date",
    "venue_name",
    "city",
    "state",
    "set_type",
    "attendance",
    "tickets_sold",
    "ticket_price",
    "gross_revenue",
    "gross_merch_sales",
    "band_percentage",
    "guarantee_amount",
    "amount_due_to_agency",
    "management_commission_pct",
    "management_commission_amount",
    "booking_agent_commission_pct",
    "booking_agent_commission_amount",
    "deal_terms",
    "bill_position",
    "other_artists_on_bill",
    "capacity",
    "age_limit",
    "contract_status",
    "contract_due_date",
    "deposit_status",
    "deposit_amount",
    "deposit_due_date",
    "final_payment_received",
    "notes",
    "venue_id",
    "event_id",
    "primary_contact_id",
    "artist_id",
    "status",
    "address",
    "show_type",
    "production_contact_name",
    "production_contact_info",
    "production_provided",
    "food_provided",
    "drinks_provided",
    "hotel_provided",
    "travel_provided",
  ]),
  artists: new Set([
    "name",
    "status",
    "notes",
    "website",
    "photo_url",
    "ridge_manages",
    "ridge_books",
    "management_commission_pct",
    "booking_agent_commission_pct",
    "archived",
  ]),
};

const REQUIRED_ON_CREATE: Record<TableName, string[]> = {
  contacts: ["full_name"],
  companies: ["name"],
  events: ["name"],
  plays: [],
  artists: ["name"],
};

export type DeleteBlocker = { label: string; href: string };

type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string; blockers?: DeleteBlocker[] };

export async function updateField(
  table: TableName,
  id: string,
  field: string,
  value: string | number | boolean | null
): Promise<ActionResult> {
  if (!EDITABLE_FIELDS[table]?.has(field)) {
    return { ok: false, error: `"${field}" is not editable on ${table}` };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update({ [field]: value === "" ? null : value })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  // The one place every play status change flows through -- board
  // drag-and-drop and the detail-page dropdown both call this. Firing the
  // notification here, rather than duplicating the check at each call
  // site, is what keeps it from being missed on either path.
  //
  // Fires on Pending Management Approval, not Contract Sent -- that's the
  // moment the agent has already signed off and the offer is handed to
  // management/the artist for their approval, which is exactly who this
  // email needs to reach and why.
  if (table === "plays" && field === "status" && value === "pending_approval") {
    await sendApprovalEmailIfNeeded(id).catch((err) => {
      console.error("Approval email step failed:", err);
    });
  }

  return { ok: true, data: undefined };
}

// Sends the "please review and approve" notification at most once per play
// -- guarded by approval_email_sent_at rather than by the play's prior
// status, since status can be changed freely (board drag, dropdown) and
// re-entering Pending Management Approval later shouldn't re-notify.
// Failures here are logged, never thrown -- the status change this runs
// after has already committed and must not appear to fail just because the
// email didn't go out.
async function sendApprovalEmailIfNeeded(playId: string): Promise<void> {
  const supabase = await createClient();

  const { data: play } = await supabase
    .from("plays")
    .select(
      `id, show_date, guarantee_amount, deal_terms, capacity, venue_name, city, state,
       approval_email_sent_at, artist_id,
       artists(id, name),
       venue:companies!plays_venue_id_fkey(id, name, city, state)`
    )
    .eq("id", playId)
    .maybeSingle();

  if (!play || play.approval_email_sent_at) return;

  const artist = play.artists as unknown as { id: string; name: string } | null;
  if (!artist) return;

  const [{ data: teamRows }, { data: agentRows }] = await Promise.all([
    supabase
      .from("contact_artists")
      .select("contacts(full_name, email)")
      .eq("artist_id", artist.id)
      .in("role", ["manager", "artist"]),
    // Booking agent is cc'd, not a primary recipient -- they already know
    // about the offer (they're the ones who submitted it for approval in
    // the first place), but they should see the thread go out.
    supabase
      .from("contact_artists")
      .select("contacts(full_name, email)")
      .eq("artist_id", artist.id)
      .eq("role", "agent"),
  ]);

  const teamRecipients = (teamRows ?? [])
    .map((row) => row.contacts as unknown as { full_name: string; email: string | null } | null)
    .filter((c): c is { full_name: string; email: string } => !!c?.email);

  const ccRecipients = (agentRows ?? [])
    .map((row) => row.contacts as unknown as { full_name: string; email: string | null } | null)
    .filter((c): c is { full_name: string; email: string } => !!c?.email);

  // No manager/artist contact on file (or none with an email) -- fall back
  // to Greg directly rather than silently marking this "sent" and notifying
  // nobody. An approval request must never just sit there unnoticed because
  // an artist profile is missing a contact; this mirrors the same fallback
  // used on the new-offer notification in offerIntake.ts.
  const usingFallback = teamRecipients.length === 0;
  const recipients = usingFallback
    ? [{ full_name: "Greg Burroughs", email: FALLBACK_NOTIFY_EMAIL }]
    : teamRecipients;

  const venue = play.venue as unknown as
    | { id: string; name: string; city: string | null; state: string | null }
    | null;
  const venueLabel = venue?.name ?? play.venue_name ?? "Venue TBD";
  const location =
    [venue?.city ?? play.city, venue?.state ?? play.state].filter(Boolean).join(", ") || null;

  // Minted once per play, right before the email that carries it -- this
  // is the credential the public /approve/[token] page trusts, so it's
  // generated server-side (never derived from anything the client sends)
  // and stored alongside approval_email_sent_at in the same write below.
  const approvalToken = crypto.randomUUID();

  await sendApprovalEmail({
    to: recipients.map((r) => r.email),
    cc: ccRecipients.map((r) => r.email),
    artistName: artist.name,
    venueLabel,
    location,
    showDate: play.show_date,
    guaranteeAmount: play.guarantee_amount,
    dealTerms: play.deal_terms,
    capacity: play.capacity,
    approveUrl: `https://base-camp-lovat.vercel.app/approve/${approvalToken}`,
    fallbackNote: usingFallback
      ? `No manager or artist contact is on file for ${artist.name} -- add one on the artist's profile so future approval requests route directly to the right person instead of you. You can still approve or decline below in the meantime.`
      : undefined,
  });

  await supabase
    .from("plays")
    .update({
      approval_email_sent_at: new Date().toISOString(),
      approval_token: approvalToken,
    })
    .eq("id", playId);
}

// Multi-column sibling of updateField -- used where two DB columns are
// edited together as one logical value (e.g. city + state as "location")
// and need to commit in a single write rather than two separate ones.
export async function updateFields(
  table: TableName,
  id: string,
  fields: Record<string, string | number | boolean | null>
): Promise<ActionResult> {
  const data: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(fields)) {
    if (!EDITABLE_FIELDS[table]?.has(field)) {
      return { ok: false, error: `"${field}" is not editable on ${table}` };
    }
    data[field] = value === "" ? null : value;
  }

  const supabase = await createClient();
  const { error } = await supabase.from(table).update(data).eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

function pickAllowed(table: TableName, data: Record<string, unknown>) {
  const allowed = EDITABLE_FIELDS[table];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (allowed.has(k)) out[k] = v === "" ? null : v;
  }
  return out;
}

export async function createRecord(
  table: TableName,
  rawData: Record<string, unknown>
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const data = pickAllowed(table, rawData);

  for (const field of REQUIRED_ON_CREATE[table]) {
    const v = data[field];
    if (v === undefined || v === null || (typeof v === "string" && !v.trim())) {
      return { ok: false, error: `${field.replace("_", " ")} is required` };
    }
  }

  if (table === "companies" && !data.type) {
    data.type = "venue";
  }

  if (table === "plays") {
    if (!data.venue_id && !data.event_id) {
      return { ok: false, error: "A venue or event is required" };
    }
    if (!data.artist_id) {
      // Only auto-fill when there's exactly one active artist to choose
      // from -- unambiguous. Now that the roster has grown past one,
      // silently picking "first alphabetically" would misattribute the
      // play to the wrong artist without anyone noticing, so an ambiguous
      // case is left unset and falls through to the NOT NULL constraint
      // instead. The New Play modal always sends an explicit artist_id for
      // exactly this reason; this is just a backstop for any other caller
      // (e.g. a future public offer form). Archived artists are excluded
      // so an old, hidden artist never gets silently picked up either way.
      const { data: activeArtists } = await supabase
        .from("artists")
        .select("id")
        .eq("archived", false)
        .order("name")
        .limit(2);
      if (activeArtists?.length === 1) data.artist_id = activeArtists[0].id;
    }

    if (data.artist_id) {
      // Prefill commission %s from the artist's standard splits so a new
      // play doesn't start blank -- still fully editable per-show after,
      // same as every other field here.
      const { data: artist } = await supabase
        .from("artists")
        .select("management_commission_pct, booking_agent_commission_pct")
        .eq("id", data.artist_id as string)
        .maybeSingle();
      if (
        artist?.management_commission_pct != null &&
        data.management_commission_pct === undefined
      ) {
        data.management_commission_pct = artist.management_commission_pct;
      }
      if (
        artist?.booking_agent_commission_pct != null &&
        data.booking_agent_commission_pct === undefined
      ) {
        data.booking_agent_commission_pct = artist.booking_agent_commission_pct;
      }
    }
  }

  const { data: inserted, error } = await supabase
    .from(table)
    .insert(data)
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: inserted.id as string } };
}

// Looks up the actual rows blocking a delete, so the confirm dialog can
// link straight to what needs to be unlinked/deleted first instead of just
// saying "something's still linked" -- named for the same NO ACTION
// foreign keys that make the delete fail in the first place: a venue is
// blocked by any event or play still pointing at it, an event by any play
// still pointing at it, a contact by any event still naming them as the
// primary contact. Plays have no such blockers (nothing but the
// contact_plays join table references them, and that cascades on its
// own), so they're not listed here. Capped at 5 named links per source
// plus a "+N more" note -- enough to unblock the common case without the
// dialog turning into a second list page.
async function findDeleteBlockers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: TableName,
  id: string
): Promise<DeleteBlocker[]> {
  const LIMIT = 5;
  const blockers: DeleteBlocker[] = [];

  function playLabel(p: { id: string; show_date: string | null; artists: unknown }) {
    const artist = p.artists as unknown as { name: string } | null;
    return [artist?.name, p.show_date].filter(Boolean).join(" — ") || "Play";
  }

  if (table === "companies") {
    const [eventsRes, eventsCount, playsRes, playsCount] = await Promise.all([
      supabase.from("events").select("id, name").eq("venue_id", id).limit(LIMIT),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("venue_id", id),
      supabase
        .from("plays")
        .select("id, show_date, artists(name)")
        .eq("venue_id", id)
        .limit(LIMIT),
      supabase.from("plays").select("id", { count: "exact", head: true }).eq("venue_id", id),
    ]);
    for (const e of eventsRes.data ?? []) {
      blockers.push({ label: `Event: ${e.name}`, href: `/events/${e.id}` });
    }
    const extraEvents = (eventsCount.count ?? 0) - (eventsRes.data?.length ?? 0);
    if (extraEvents > 0) blockers.push({ label: `+${extraEvents} more event(s)`, href: "" });

    for (const p of playsRes.data ?? []) {
      blockers.push({ label: `Play: ${playLabel(p)}`, href: `/plays/${p.id}` });
    }
    const extraPlays = (playsCount.count ?? 0) - (playsRes.data?.length ?? 0);
    if (extraPlays > 0) blockers.push({ label: `+${extraPlays} more play(s)`, href: "" });
  }

  if (table === "events") {
    const [playsRes, playsCount] = await Promise.all([
      supabase
        .from("plays")
        .select("id, show_date, artists(name)")
        .eq("event_id", id)
        .limit(LIMIT),
      supabase.from("plays").select("id", { count: "exact", head: true }).eq("event_id", id),
    ]);
    for (const p of playsRes.data ?? []) {
      blockers.push({ label: `Play: ${playLabel(p)}`, href: `/plays/${p.id}` });
    }
    const extraPlays = (playsCount.count ?? 0) - (playsRes.data?.length ?? 0);
    if (extraPlays > 0) blockers.push({ label: `+${extraPlays} more play(s)`, href: "" });
  }

  if (table === "contacts") {
    const [eventsRes, eventsCount] = await Promise.all([
      supabase.from("events").select("id, name").eq("primary_contact_id", id).limit(LIMIT),
      supabase
        .from("events")
        .select("id", { count: "exact", head: true })
        .eq("primary_contact_id", id),
    ]);
    for (const e of eventsRes.data ?? []) {
      blockers.push({ label: `Event: ${e.name}`, href: `/events/${e.id}` });
    }
    const extraEvents = (eventsCount.count ?? 0) - (eventsRes.data?.length ?? 0);
    if (extraEvents > 0) blockers.push({ label: `+${extraEvents} more event(s)`, href: "" });
  }

  return blockers;
}

// Hard-deletes a top-level record. Join-table rows (contact_venues,
// contact_events, contact_plays, contact_artists) cascade automatically,
// as does an artist's plays -- callers that delete an artist should warn
// about that blast radius up front (see DeleteRecordButton's
// cascadeWarning prop) since there's no undo once this runs. A handful of
// other foreign keys (a company still set as an event/play's venue, an
// event still linked to a play) are NO ACTION rather than cascading, so
// Postgres blocks those deletes outright -- surfaced here as a plain-
// language message with links to what's blocking it, via
// findDeleteBlockers above, instead of a raw constraint-violation error.
export async function deleteRecord(table: TableName, id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from(table).delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      const blockers = await findDeleteBlockers(supabase, table, id);
      return {
        ok: false,
        error: blockers.length
          ? "This record is still linked to the following — remove or reassign these first:"
          : "This record is still linked to other records and can't be deleted until those links are removed or reassigned.",
        blockers,
      };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true, data: undefined };
}

export type GlobalSearchGroup = {
  table: TableName;
  label: string;
  results: { id: string; label: string; sublabel: string | null; href: string }[];
};

// Site-wide search from the Dashboard. Scoped to structured fields only --
// notes/free-text/deal-terms fields are excluded so results stay precise
// (matching only real names, locations, contact info, and statuses) rather
// than surfacing noisy substring hits buried in long-form notes.
export async function globalSearch(query: string): Promise<GlobalSearchGroup[]> {
  const q = query.trim();
  if (!q) return [];
  const supabase = await createClient();
  const esc = q.replace(/[%,]/g, "");
  if (!esc) return [];

  const [contactsRes, companiesRes, eventsRes, playsRes] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, full_name, email, phone, title")
      .or(
        `full_name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,title.ilike.%${esc}%`
      )
      .order("full_name")
      .limit(6),
    supabase
      .from("companies")
      .select("id, name, type, city, state, phone, website")
      .or(
        `name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%,phone.ilike.%${esc}%,website.ilike.%${esc}%`
      )
      .order("name")
      .limit(6),
    supabase
      .from("events")
      .select("id, name, city, state")
      .or(`name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%`)
      .order("name")
      .limit(6),
    supabase
      .from("plays")
      .select(
        "id, show_date, venue_name, city, state, set_type, contract_status, deposit_status, artists(name)"
      )
      .or(
        `venue_name.ilike.%${esc}%,city.ilike.%${esc}%,state.ilike.%${esc}%,set_type.ilike.%${esc}%,contract_status.ilike.%${esc}%,deposit_status.ilike.%${esc}%`
      )
      .order("show_date", { ascending: false })
      .limit(6),
  ]);

  const groups: GlobalSearchGroup[] = [];

  if (contactsRes.data?.length) {
    groups.push({
      table: "contacts",
      label: "Contacts",
      results: contactsRes.data.map((c) => ({
        id: c.id,
        label: c.full_name,
        sublabel: c.title || c.email || c.phone || null,
        href: `/contacts/${c.id}`,
      })),
    });
  }

  if (companiesRes.data?.length) {
    groups.push({
      table: "companies",
      label: "Venues & Companies",
      results: companiesRes.data.map((c) => ({
        id: c.id,
        label: c.name,
        sublabel: [c.city, c.state].filter(Boolean).join(", ") || null,
        href: `/companies/${c.id}`,
      })),
    });
  }

  if (eventsRes.data?.length) {
    groups.push({
      table: "events",
      label: "Events",
      results: eventsRes.data.map((e) => ({
        id: e.id,
        label: e.name,
        sublabel: [e.city, e.state].filter(Boolean).join(", ") || null,
        href: `/events/${e.id}`,
      })),
    });
  }

  if (playsRes.data?.length) {
    groups.push({
      table: "plays",
      label: "Plays",
      results: playsRes.data.map((p) => {
        const artist = p.artists as unknown as { name: string } | null;
        return {
          id: p.id,
          label: [artist?.name, p.venue_name].filter(Boolean).join(" @ ") || "Play",
          sublabel:
            [p.show_date, [p.city, p.state].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ") || null,
          href: `/plays/${p.id}`,
        };
      }),
    });
  }

  return groups;
}

// Additive contact <-> venue/event/play associations (contact_venues /
// contact_events / contact_plays join tables). Separate from a contact's
// primary company_id, or the venue/event/play they're primary_contact_id
// (or company_id, for venues) on -- a contact can be tied to any number of
// additional records without disturbing whichever one is "primary".
export type AssociationKind = "venue" | "event" | "play";

const ASSOCIATION_TABLE: Record<AssociationKind, string> = {
  venue: "contact_venues",
  event: "contact_events",
  play: "contact_plays",
};

const ASSOCIATION_TARGET_COL: Record<AssociationKind, string> = {
  venue: "company_id",
  event: "event_id",
  play: "play_id",
};

export async function addContactAssociation(
  kind: AssociationKind,
  contactId: string,
  targetId: string
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from(ASSOCIATION_TABLE[kind])
    .insert({ contact_id: contactId, [ASSOCIATION_TARGET_COL[kind]]: targetId })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id as string } };
}

export async function removeContactAssociation(
  kind: AssociationKind,
  rowId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from(ASSOCIATION_TABLE[kind])
    .delete()
    .eq("id", rowId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

// Promotes an "additional" contact association into the corresponding
// "primary" field -- the star-icon control on both sides of the additive
// lists (Contact page's additional venues/events, and the Venue/Event/Play
// page's additional contacts). Whatever previously held the primary slot
// isn't dropped: it's demoted into the same join table as a new additional
// row, so this is always a lossless, reversible swap and never needs a
// confirm step the way replacing a primary via search does.
export async function makePrimaryContact(
  kind: AssociationKind,
  contactId: string,
  targetId: string,
  joinRowId: string
): Promise<ActionResult> {
  const supabase = await createClient();

  if (kind === "venue") {
    const { data: contact } = await supabase
      .from("contacts")
      .select("company_id")
      .eq("id", contactId)
      .maybeSingle();
    const oldCompanyId = (contact?.company_id as string | null) ?? null;

    const { error } = await supabase
      .from("contacts")
      .update({ company_id: targetId })
      .eq("id", contactId);
    if (error) return { ok: false, error: error.message };

    await supabase.from("contact_venues").delete().eq("id", joinRowId);
    if (oldCompanyId && oldCompanyId !== targetId) {
      await supabase
        .from("contact_venues")
        .insert({ contact_id: contactId, company_id: oldCompanyId });
    }
    return { ok: true, data: undefined };
  }

  const table = kind === "event" ? "events" : "plays";
  const joinTable = kind === "event" ? "contact_events" : "contact_plays";
  const targetCol = kind === "event" ? "event_id" : "play_id";

  const { data: target } = await supabase
    .from(table)
    .select("primary_contact_id")
    .eq("id", targetId)
    .maybeSingle();
  const oldContactId = (target?.primary_contact_id as string | null) ?? null;

  const { error } = await supabase
    .from(table)
    .update({ primary_contact_id: contactId })
    .eq("id", targetId);
  if (error) return { ok: false, error: error.message };

  await supabase.from(joinTable).delete().eq("id", joinRowId);
  if (oldContactId && oldContactId !== contactId) {
    await supabase.from(joinTable).insert({ contact_id: oldContactId, [targetCol]: targetId });
  }
  return { ok: true, data: undefined };
}

// Artist team roster (contact_artists): unlike the venue/event/play contact
// associations above, there's no single "primary" contact for an artist --
// a Manager and a Booking Agent are different roles entirely, and each can
// hold any number of contacts. So this is its own small set of actions
// rather than reusing AssociationKind, which has no room for a role.
export type ArtistTeamRole =
  | "artist"
  | "manager"
  | "agent"
  | "tour_manager"
  | "publicist"
  | "other";

export async function addArtistTeamMember(
  artistId: string,
  contactId: string,
  role: ArtistTeamRole
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contact_artists")
    .insert({ artist_id: artistId, contact_id: contactId, role })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: data.id as string } };
}

export async function removeArtistTeamMember(rowId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("contact_artists").delete().eq("id", rowId);

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: undefined };
}

export type SearchTable = "companies" | "events" | "contacts";

export async function searchRecords(
  table: SearchTable,
  query: string
): Promise<{ id: string; label: string; sublabel: string | null }[]> {
  const supabase = await createClient();
  const nameCol = table === "contacts" ? "full_name" : "name";
  const extraCols = table === "companies" ? ", city, state" : "";

  let q = supabase
    .from(table)
    .select(`id, ${nameCol}${extraCols}`)
    .order(nameCol)
    .limit(20);

  // Archived venues/events are meant to disappear from pickers the same
  // way archived artists already do -- someone linking a new play or event
  // shouldn't land on a record that was deliberately hidden. Existing
  // links elsewhere on the site are untouched either way.
  if (table === "companies" || table === "events") {
    q = q.eq("archived", false);
  }

  if (query.trim()) {
    q = q.ilike(nameCol, `%${query.trim()}%`);
  }

  const { data } = await q;
  return (data ?? []).map((row) => {
    const r = row as unknown as Record<string, unknown>;
    const sub =
      table === "companies"
        ? [r.city, r.state].filter(Boolean).join(", ") || null
        : null;
    return { id: r.id as string, label: r[nameCol] as string, sublabel: sub };
  });
}

// Small, curated list (not a growing search-as-you-type table like
// companies/events/contacts), so a plain dropdown rather than the generic
// SearchTable/RelationSearchPicker machinery. Used by the New Play modal
// and, indirectly, wherever a play's artist needs to be picked or changed.
export async function listActiveArtists(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artists")
    .select("id, name")
    .eq("archived", false)
    .order("name");
  return data ?? [];
}

// Unfiltered (includes archived) and pre-shaped as InlineSelectField options
// -- used on an existing play's detail page, where the play may already be
// linked to an artist who's since been archived. Excluding them there would
// make that play's artist field render as blank instead of showing (and
// letting someone reassign) who it's actually linked to.
export async function listAllArtistOptions(): Promise<
  { value: string; label: string }[]
> {
  const supabase = await createClient();
  const { data } = await supabase.from("artists").select("id, name").order("name");
  return (data ?? []).map((a) => ({ value: a.id, label: a.name }));
}
