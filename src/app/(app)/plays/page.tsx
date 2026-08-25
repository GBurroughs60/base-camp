import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

type PlayRow = {
  id: string;
  show_date: string | null;
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

export default async function PlaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("plays")
    .select(
      "id, show_date, venue_name, venue_id, city, state, set_type, attendance, tickets_sold, guarantee_amount, deal_terms, event_id, artists(name), events(name), venue:companies!plays_venue_id_fkey(id, name)"
    )
    .order("show_date", { ascending: true });

  if (year) {
    query = query
      .gte("show_date", `${year}-01-01`)
      .lte("show_date", `${year}-12-31`);
  }

  const { data } = await query;
  const plays = (data ?? []) as unknown as PlayRow[];

  const years = ["2022", "2023", "2024", "2025", "2026", "2027"];

  const filterPills = (
    <>
      <Link
        href="/plays"
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
          href={`/plays?year=${y}`}
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

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Plays</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {plays.length} shows{year ? ` in ${year}` : ""}
      </p>

      <DataTable
        rows={plays.map(toRow)}
        columns={columns}
        searchPlaceholder="Search plays..."
        emptyMessage="No plays yet."
        defaultSortKey="date"
        toolbarLeft={filterPills}
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
