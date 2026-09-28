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
    searchText: [
      e.name,
      e.companies?.name,
      e.city,
      stateOrCountry,
      e.contacts?.full_name,
      e.is_public ? "Public" : "Private",
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
      "id, name, is_public, city, state, country, archived, pending_state_review, dedup_uncertain, dedup_match_id, refresh_flagged, catchup_drafted, companies(id, name), contacts(id, full_name)"
    )
    .order("name");

  if (activeVisibility === "public") query = query.eq("is_public", true);
  if (activeVisibility === "private") query = query.eq("is_public", false);
  if (activeStatus === "archived") query = query.eq("archived", true);
  else if (activeStatus === "active" || activeStatus === "needs-date") {
    // "needs-date" is scoped to the live set too. Discovery-sourced rows
    // still pending their state's sample review stay hidden here, same
    // treatment as archived -- see events.pending_state_review.
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
  // file is null or already in the past. Same definition as the
  // events_needing_attention view (see docs/outreach-engine-plan.md) --
  // expressed here as a plain NOT IN against a small id list rather than
  // querying the view directly, since PostgREST's relationship embedding
  // (companies(...), contacts(...)) isn't guaranteed to follow through a
  // view the way it does the base table. Private events are excluded --
  // verified every private "needs date" row is a historical one-off
  // booking that already has a play on file and will never need a
  // projected future date (see the view's own migration).
  if (activeStatus === "needs-date") {
    query = query.eq("is_public", true);
    const { data: liveOccurrences } = await supabase
      .from("event_occurrences")
      .select("event_id")
      .not("occurrence_date", "is", null)
      .gte("occurrence_date", new Date().toISOString().slice(0, 10));
    const liveEventIds = Array.from(
      new Set((liveOccurrences ?? []).map((o) => o.event_id as string))
    );
    if (liveEventIds.length > 0) {
      query = query.not("id", "in", `(${liveEventIds.join(",")})`);
    }
  }

  const { data } = await query;
  const events = (data ?? []) as unknown as EventRow[];

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
