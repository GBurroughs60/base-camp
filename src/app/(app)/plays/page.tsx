import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";
import PlaysBoard, { type BoardPlay } from "@/components/PlaysBoard";
import {
  type PlayStatus,
  PLAY_STATUS_LABELS,
  PLAY_STATUS_BADGE_CLASSES,
  LIVE_PIPELINE_STATUSES,
  STATUS_FILTER_GROUPS,
} from "@/lib/playStatus";

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type PlayRow = {
  id: string;
  show_date: string | null;
  status: PlayStatus;
  venue_name: string | null;
  venue_id: string | null;
  city: string | null;
  state: string | null;
  set_type: string | null;
  attendance: number | null;
  tickets_sold: number | null;
  guarantee_amount: number | null;
  deal_terms: string | null;
  event_id: string | null;
  artists: { name: string } | null;
  events: { name: string } | null;
  venue: { id: string; name: string } | null;
};

const columns: ColumnMeta[] = [
  { key: "date", label: "Date", sortable: true },
  { key: "artist", label: "Artist", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "venue", label: "Venue", sortable: true },
  { key: "city", label: "City", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "event", label: "Event", sortable: true },
  { key: "set", label: "Set", sortable: true },
  { key: "attendance", label: "Attendance", sortable: true },
  { key: "deal", label: "Deal", sortable: true },
];

function toRow(t: PlayRow): DataRow {
  const dealDisplay = t.guarantee_amount ? formatMoney(t.guarantee_amount) : t.deal_terms ?? "—";
  const statusLabel = PLAY_STATUS_LABELS[t.status] ?? t.status;
  return {
    id: t.id,
    cells: {
      date: (
        <Link
          href={`/plays/${t.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4 whitespace-nowrap"
        >
          {t.show_date ?? "View play"}
        </Link>
      ),
      artist: t.artists?.name ?? "—",
      status: (
        <span
          className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
            PLAY_STATUS_BADGE_CLASSES[t.status] ?? ""
          }`}
        >
          {statusLabel}
        </span>
      ),
      venue: t.venue ? (
        <Link
          href={`/companies/${t.venue.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {t.venue.name}
        </Link>
      ) : (
        t.venue_name ?? "—"
      ),
      city: t.city ?? "—",
      state: t.state ?? "—",
      event: t.event_id ? (
        <Link
          href={`/events/${t.event_id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {t.events?.name ?? "View event"}
        </Link>
      ) : (
        "—"
      ),
      set: t.set_type ?? "—",
      attendance: t.attendance ?? "—",
      deal: dealDisplay,
    },
    sortValues: {
      date: t.show_date,
      artist: t.artists?.name ?? null,
      status: statusLabel,
      venue: t.venue?.name ?? t.venue_name,
      city: t.city,
      state: t.state,
      event: t.events?.name ?? null,
      set: t.set_type,
      attendance: t.attendance,
      deal: t.guarantee_amount,
    },
    searchText: [
      t.show_date,
      t.artists?.name,
      statusLabel,
      t.venue?.name ?? t.venue_name,
      t.city,
      t.state,
      t.events?.name,
      t.set_type,
      t.attendance != null ? String(t.attendance) : null,
      dealDisplay,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

function buildHref(params: { year?: string; status?: string; view?: string }) {
  const qs = new URLSearchParams();
  if (params.year) qs.set("year", params.year);
  if (params.status && params.status !== "all") qs.set("status", params.status);
  if (params.view && params.view !== "list") qs.set("view", params.view);
  const s = qs.toString();
  return s ? `/plays?${s}` : "/plays";
}

export default async function PlaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; status?: string; view?: string }>;
}) {
  const { year, status, view } = await searchParams;
  const activeView = view === "board" ? "board" : "list";
  const activeBucket =
    STATUS_FILTER_GROUPS.find((g) => g.key === status) ?? STATUS_FILTER_GROUPS[0];

  const supabase = await createClient();

  let query = supabase
    .from("plays")
    .select(
      "id, show_date, status, venue_name, venue_id, city, state, set_type, attendance, tickets_sold, guarantee_amount, deal_terms, event_id, artists(name), events(name), venue:companies!plays_venue_id_fkey(id, name)"
    )
    .order("show_date", { ascending: true });

  if (year) {
    query = query.gte("show_date", `${year}-01-01`).lte("show_date", `${year}-12-31`);
  }

  const { data } = await query;
  const allPlays = (data ?? []) as unknown as PlayRow[];

  // List view respects the bucket pill; the board is inherently scoped to
  // the live pipeline statuses, so it ignores the bucket and always shows
  // exactly those columns.
  const listPlays = activeBucket.statuses
    ? allPlays.filter((p) => activeBucket.statuses!.includes(p.status))
    : allPlays;

  const boardPlays: BoardPlay[] = allPlays
    .filter((p) => LIVE_PIPELINE_STATUSES.includes(p.status))
    .map((p) => ({
      id: p.id,
      status: p.status,
      artist_name: p.artists?.name ?? null,
      venue_label: p.venue?.name ?? p.venue_name,
      show_date: p.show_date,
      guarantee_amount: p.guarantee_amount,
    }));

  const years = ["2022", "2023", "2024", "2025", "2026", "2027"];

  const yearPills = (
    <>
      <Link
        href={buildHref({ status, view: activeView })}
        className={`px-3 py-1 text-sm rounded-full border transition-colors ${
          !year
            ? "bg-ridge-orange text-white border-transparent"
            : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
        }`}
      >
        All
      </Link>
      {years.map((y) => (
        <a
          key={y}
          href={buildHref({ year: y, status, view: activeView })}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            year === y
              ? "bg-ridge-orange text-white border-transparent"
              : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
          }`}
        >
          {y}
        </a>
      ))}
    </>
  );

  const statusPills = (
    <>
      {STATUS_FILTER_GROUPS.map((g) => (
        <a
          key={g.key}
          href={buildHref({ year, status: g.key, view: activeView })}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeBucket.key === g.key
              ? "bg-ridge-orange text-white border-transparent"
              : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
          }`}
        >
          {g.label}
        </a>
      ))}
    </>
  );

  const viewToggle = (
    <div className="inline-flex rounded-lg border border-black/15 dark:border-white/15 overflow-hidden text-sm shrink-0">
      <a
        href={buildHref({ year, status, view: "list" })}
        className={`px-3 py-1.5 transition-colors ${
          activeView === "list"
            ? "bg-ridge-orange text-white"
            : "hover:bg-black/[.03] dark:hover:bg-white/[.06]"
        }`}
      >
        List
      </a>
      <a
        href={buildHref({ year, status, view: "board" })}
        className={`px-3 py-1.5 border-l border-black/15 dark:border-white/15 transition-colors ${
          activeView === "board"
            ? "bg-ridge-orange text-white"
            : "hover:bg-black/[.03] dark:hover:bg-white/[.06]"
        }`}
      >
        Board
      </a>
    </div>
  );

  const filtersBelow = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">{yearPills}</div>
      <div className="flex flex-wrap gap-2">{statusPills}</div>
    </div>
  );

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Plays</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {activeView === "list" ? listPlays.length : boardPlays.length} records
      </p>

      {activeView === "list" ? (
        <DataTable
          rows={listPlays.map(toRow)}
          columns={columns}
          searchPlaceholder="Search plays..."
          emptyMessage="No plays yet."
          defaultSortKey="date"
          toolbarLeft={viewToggle}
          toolbarRight={<NewRecordButton />}
          filtersBelow={filtersBelow}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {viewToggle}
            <div className="flex-1" />
            <NewRecordButton />
          </div>
          <div className="flex flex-wrap gap-2 mb-4">{yearPills}</div>
          <PlaysBoard plays={boardPlays} />
        </>
      )}
    </div>
  );
}
