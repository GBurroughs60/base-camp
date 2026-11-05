import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DedupRowActions from "@/components/inline/DedupRowActions";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

type EventRow = {
  id: string;
  name: string;
  is_public: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  archived: boolean;
  pending_state_review: boolean;
  dedup_uncertain: boolean;
  dedup_match_id: string | null;
  refresh_flagged: boolean;
  catchup_drafted: boolean;
  genre_tags: string[] | null;
  typical_performance_days: string | null;
  submission_notes: string | null;
  notes: string | null;
  research_log: string | null;
  companies: { id: string; name: string } | null;
  contacts: { id: string; full_name: string } | null;
};

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "20%" },
  { key: "venue", label: "Venue", sortable: true, width: "18%" },
  { key: "city", label: "City", sortable: true, width: "15%" },
  { key: "state", label: "State", sortable: true, width: "9%" },
  { key: "contact", label: "Contact", sortable: true, width: "26%" },
  { key: "visibility", label: "Visibility", sortable: true, width: "12%" },
];

// Same reasoning as companies/page.tsx's dedupColumns: the resolve
// actions need real width, so Needs Dedup Check swaps Contact/Visibility
// out for one wide Resolve column rather than shrinking every column to
// make room in a view every other filter also has to render.
const dedupColumns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "20%" },
  { key: "venue", label: "Venue", sortable: true, width: "16%" },
  { key: "city", label: "City", sortable: true, width: "12%" },
  { key: "state", label: "State", sortable: true, width: "7%" },
  { key: "dedup", label: "Resolve", width: "45%" },
];

function toRow(e: EventRow, dedupMatchName: Map<string, string>): DataRow {
  const stateOrCountry = e.state ?? (e.country && e.country !== "USA" ? e.country : null);
  return {
    id: e.id,
    cells: {
      name: (
        <span className="inline-flex items-center gap-2">
          <Link
            href={`/events/${e.id}`}
            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
          >
            {e.name}
          </Link>
          {e.archived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Archived
            </span>
          )}
          {e.pending_state_review && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Pending Review
            </span>
          )}
          {e.dedup_uncertain && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-400">
              Needs Dedup Check
            </span>
          )}
          {e.refresh_flagged && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-400">
              Needs Refresh Check
            </span>
          )}
          {e.catchup_drafted && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Catch-Up Drafted
            </span>
          )}
        </span>
      ),
      venue: e.companies ? (
        <Link
          href={`/companies/${e.companies.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {e.companies.name}
        </Link>
      ) : (
        "—"
      ),
      city: e.city ?? "—",
      state: stateOrCountry ?? "—",
      contact: e.contacts ? (
        <Link
          href={`/contacts/${e.contacts.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {e.contacts.full_name}
        </Link>
      ) : (
        "—"
      ),
      visibility: e.is_public ? "Public" : "Private",
      dedup: e.dedup_uncertain ? (
        <DedupRowActions
          table="events"
          id={e.id}
          matchId={e.dedup_match_id}
          matchLabel={e.dedup_match_id ? (dedupMatchName.get(e.dedup_match_id) ?? "Unknown") : null}
          matchHref={e.dedup_match_id ? `/events/${e.dedup_match_id}` : null}
        />
      ) : (
        "—"
      ),
    },
    sortValues: {
      name: e.name,
      venue: e.companies?.name ?? null,
      city: e.city,
      state: stateOrCountry,
      contact: e.contacts?.full_name ?? null,
      visibility: e.is_public ? "Public" : "Private",
    },
    // 2026-11-05, per Greg: genre tags, typical performance days,
    // submission notes, and the research log should all be searchable
    // too ("Wednesday" or "Americana Vermont" should surface a match) --
    // folded into the same tokenized-AND search DataTable already runs
    // against every other field here. notes/research_log included for
    // recall even though they're long -- cheap to include, and an old
    // research note mentioning a real detail is still a legitimate match.
    searchText: [
      e.name,
      e.companies?.name,
      e.city,
      stateOrCountry,
      e.contacts?.full_name,
      e.is_public ? "Public" : "Private",
      ...(e.genre_tags ?? []),
      e.typical_performance_days,
      e.submission_notes,
      e.notes,
      e.research_log,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string; status?: string }>;
}) {
  const { visibility, status } = await searchParams;
  const supabase = await createClient();

  // Default to "all" visibility so the unfiltered view matches the sidebar's
  // event count (archived=false, regardless of public/private) -- same as
  // every other section, which only has the one archived/active axis.
  const activeVisibility = visibility ?? "all";
  const activeStatus = status ?? "active";

  let query = supabase
    .from("events")
    .select(
      "id, name, is_public, city, state, country, archived, pending_state_review, dedup_uncertain, dedup_match_id, refresh_flagged, catchup_drafted, genre_tags, typical_performance_days, submission_notes, notes, research_log, companies(id, name), contacts(id, full_name)"
    )
    .order("name");

  if (activeVisibility === "public") query = query.eq("is_public", true);
  if (activeVisibility === "private") query = query.eq("is_public", false);
  if (activeStatus === "archived") query = query.eq("archived", true);
  else if (activeStatus === "active") {
    query = query.eq("archived", false).eq("pending_state_review", false);
  } else if (activeStatus === "dedup-check") {
    // Surfaces flagged near-misses regardless of review state, so nothing
    // waits on a state being approved before it can be resolved.
    query = query.eq("dedup_uncertain", true).eq("archived", false);
  } else if (activeStatus === "refresh-check") {
    // Refresh (see events.refresh_flagged) couldn't confidently verify
    // these -- surfaced the same way dedup-check is.
    query = query.eq("refresh_flagged", true).eq("archived", false);
  } else if (activeStatus === "catchup-drafted") {
    // Crawl-stage Catch-up (see events.catchup_drafted) already has a
    // Gmail draft waiting -- one place to glance at without opening Gmail.
    query = query.eq("catchup_drafted", true).eq("archived", false);
  } // "all" applies no archived/pending-review filter

  // "Needs Date" -- events with nothing live for the catch-up/standing-
  // cadence engines to act on: no occurrence row at all, or every one on
  // file is null or already in the past. Queries events_needing_attention
  // directly (see docs/outreach-engine-plan.md) instead of re-deriving the
  // same definition against the base `events` table with a NOT IN list of
  // every future-dated occurrence's event_id. That list used to run
  // ~1,000 UUIDs long -- ~37KB of raw text, comfortably past the
  // URL-length ceiling PostgREST's own edge sits behind -- and the old
  // code swallowed that failure outright (`const { data } = await query`
  // with no error check), silently rendering "No events yet." even though
  // the real backlog was ~824 rows. Fixed 2026-11-02 after Greg reported
  // the symptom; see docs/db-schema-tracking-gaps.md's sibling notes for
  // the general pattern of this class of bug.
  //
  // The view already guarantees is_public = true, archived = false, and
  // pending_state_review = false for every row it returns (see its own
  // definition), so this status ignores the visibility pill entirely --
  // same effective behavior as the old `.eq("is_public", true)` override,
  // just now structural rather than an extra filter. A "Private" + "Needs
  // Date" combination still shows nothing, which is correct: no private
  // event has ever actually needed this (every private "needs date" row
  // is a historical one-off booking that already has a play on file and
  // will never need a projected future date -- see the view's own
  // migration).
  //
  // PostgREST relationship embedding (companies(...), contacts(...)) isn't
  // guaranteed to follow through a view the way it does the base table, so
  // venue/contact names are resolved the same two-hop way the weekly
  // events-needing-attention digest cron already does it (see
  // src/app/api/cron/events-needing-attention/route.ts). dedup_uncertain/
  // refresh_flagged/catchup_drafted badges are deliberately not carried
  // through here either, same simplification that digest cron already
  // made for this same view (it only ever shows id/name/city/state/venue)
  // -- those are a different lens with their own pills (Needs Dedup Check,
  // Needs Refresh Check, Catch-Up Drafted), not this one.
  let events: EventRow[];
  let queryError: string | null = null;

  if (activeStatus === "needs-date") {
    const { data: needsAttention, error } = await supabase
      .from("events_needing_attention")
      .select("id, name, city, state, country, venue_id, primary_contact_id")
      .order("name");

    if (error) {
      console.error("events/page: events_needing_attention query failed", error);
      queryError = error.message;
      events = [];
    } else {
      const rows = needsAttention ?? [];
      const venueIds = Array.from(
        new Set(rows.map((r) => r.venue_id as string | null).filter((v): v is string => !!v))
      );
      const contactIds = Array.from(
        new Set(rows.map((r) => r.primary_contact_id as string | null).filter((v): v is string => !!v))
      );

      const [{ data: venues }, { data: contacts }] = await Promise.all([
        venueIds.length
          ? supabase.from("companies").select("id, name").in("id", venueIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        contactIds.length
          ? supabase.from("contacts").select("id, full_name").in("id", contactIds)
          : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      ]);
      const venueNameById = new Map((venues ?? []).map((v) => [v.id as string, v.name as string]));
      const contactNameById = new Map((contacts ?? []).map((c) => [c.id as string, c.full_name as string]));

      events = rows.map((r) => {
        const venueId = r.venue_id as string | null;
        const contactId = r.primary_contact_id as string | null;
        return {
          id: r.id as string,
          name: r.name as string,
          is_public: true,
          city: r.city as string | null,
          state: r.state as string | null,
          country: r.country as string | null,
          archived: false,
          pending_state_review: false,
          dedup_uncertain: false,
          dedup_match_id: null,
          refresh_flagged: false,
          catchup_drafted: false,
          // Same simplification as the other flags above -- this lens
          // only ever shows id/name/city/state/venue, not the new
          // structured fields, so toRow()'s searchText just has less to
          // work with for a Needs Date row (fine: city/state/name alone
          // still cover the common case).
          genre_tags: null,
          typical_performance_days: null,
          submission_notes: null,
          notes: null,
          research_log: null,
          companies: venueId ? { id: venueId, name: venueNameById.get(venueId) ?? "Unknown venue" } : null,
          contacts: contactId ? { id: contactId, full_name: contactNameById.get(contactId) ?? "Unknown contact" } : null,
        };
      });
    }
  } else {
    const { data, error } = await query;
    if (error) {
      console.error("events/page: events query failed", error);
      queryError = error.message;
    }
    events = (data ?? []) as unknown as EventRow[];
  }

  // Matched events aren't a declared FK the DataRow embed can follow
  // (dedup_match_id is a plain uuid, same reasoning as candidates.
  // matched_event_id in candidates/page.tsx) -- one small separate
  // lookup rather than a second round-trip per row.
  const dedupMatchIds = Array.from(
    new Set(events.map((e) => e.dedup_match_id).filter((v): v is string => !!v))
  );
  const { data: dedupMatches } = dedupMatchIds.length
    ? await supabase.from("events").select("id, name").in("id", dedupMatchIds)
    : { data: [] as { id: string; name: string }[] };
  const dedupMatchName = new Map(
    (dedupMatches ?? []).map((m) => [m.id as string, m.name as string])
  );

  // Visibility (public/private) and archive status are independent axes,
  // so each pill link has to carry the *other* filter's current value
  // forward rather than resetting it.
  function href(nextVisibility: string, nextStatus: string) {
    return `/events?visibility=${nextVisibility}&status=${nextStatus}`;
  }

  const visibilityPills = (
    <>
      {[
        { key: "public", label: "Public" },
        { key: "private", label: "Private" },
        { key: "all", label: "All" },
      ].map((f) => (
        <a
          key={f.key}
          href={href(f.key, activeStatus)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeVisibility === f.key
              ? "bg-ridge-orange text-white border-transparent"
              : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
          }`}
        >
          {f.label}
        </a>
      ))}
    </>
  );

  const statusPills = (
    <>
      {[
        { key: "active", label: "Active" },
        { key: "needs-date", label: "Needs Date" },
        { key: "dedup-check", label: "Needs Dedup Check" },
        { key: "refresh-check", label: "Needs Refresh Check" },
        { key: "catchup-drafted", label: "Catch-Up Drafted" },
        { key: "archived", label: "Archived" },
        { key: "all", label: "All" },
      ].map((f) => (
        <a
          key={f.key}
          href={href(activeVisibility, f.key)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeStatus === f.key
              ? "bg-ridge-orange text-white border-transparent"
              : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
          }`}
        >
          {f.label}
        </a>
      ))}
    </>
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Events</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {events.length} records
      </p>

      {queryError && (
        <div className="mb-4 rounded-lg border border-red-600/20 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-sm text-red-800 dark:text-red-300">
          Couldn&apos;t load this list ({queryError}) -- this is a real error, not an empty backlog.
          Reload, or check the server logs if it persists.
        </div>
      )}

      <DataTable
        rows={events.map((e) => toRow(e, dedupMatchName))}
        columns={activeStatus === "dedup-check" ? dedupColumns : columns}
        searchPlaceholder="Search events..."
        emptyMessage="No events yet."
        defaultSortKey="name"
        toolbarLeft={visibilityPills}
        toolbarRight={<NewRecordButton />}
        filtersBelow={<div className="flex items-center gap-2">{statusPills}</div>}
      />
    </div>
  );
}
