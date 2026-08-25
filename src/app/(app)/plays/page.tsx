import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type Column } from "@/components/DataTable";

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

const columns: Column<PlayRow>[] = [
  {
    key: "date",
    label: "Date",
    render: (t) => (
      <Link
        href={`/plays/${t.id}`}
        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4 whitespace-nowrap"
      >
        {t.show_date ?? "View play"}
      </Link>
    ),
    sortValue: (t) => t.show_date,
    searchValue: (t) => t.show_date ?? "",
  },
  {
    key: "artist",
    label: "Artist",
    render: (t) => t.artists?.name ?? "—",
    sortValue: (t) => t.artists?.name ?? null,
    searchValue: (t) => t.artists?.name ?? "",
  },
  {
    key: "venue",
    label: "Venue",
    render: (t) =>
      t.venue ? (
        <Link
          href={`/companies/${t.venue.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {t.venue.name}
        </Link>
      ) : (
        t.venue_name ?? "—"
      ),
    sortValue: (t) => t.venue?.name ?? t.venue_name,
    searchValue: (t) => t.venue?.name ?? t.venue_name ?? "",
  },
  {
    key: "city",
    label: "City",
    render: (t) => t.city ?? "—",
    sortValue: (t) => t.city,
    searchValue: (t) => t.city ?? "",
  },
  {
    key: "state",
    label: "State",
    render: (t) => t.state ?? "—",
    sortValue: (t) => t.state,
    searchValue: (t) => t.state ?? "",
  },
  {
    key: "event",
    label: "Event",
    render: (t) =>
      t.event_id ? (
        <Link
          href={`/events/${t.event_id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {t.events?.name ?? "View event"}
        </Link>
      ) : (
        "—"
      ),
    sortValue: (t) => t.events?.name ?? null,
    searchValue: (t) => t.events?.name ?? "",
  },
  {
    key: "set",
    label: "Set",
    render: (t) => t.set_type ?? "—",
    sortValue: (t) => t.set_type,
    searchValue: (t) => t.set_type ?? "",
  },
  {
    key: "attendance",
    label: "Attendance",
    render: (t) => t.attendance ?? "—",
    sortValue: (t) => t.attendance,
    searchValue: (t) => (t.attendance != null ? String(t.attendance) : ""),
  },
  {
    key: "deal",
    label: "Deal",
    render: (t) => (t.guarantee_amount ? formatMoney(t.guarantee_amount) : t.deal_terms ?? "—"),
    sortValue: (t) => t.guarantee_amount,
    searchValue: (t) =>
      [t.guarantee_amount != null ? formatMoney(t.guarantee_amount) : null, t.deal_terms]
        .filter(Boolean)
        .join(" "),
  },
];

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

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Plays</h1>
        <NewRecordButton />
      </div>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {plays.length} shows{year ? ` in ${year}` : ""}
      </p>

      <div className="flex gap-2 mb-6 text-sm">
        <Link
          href="/plays"
          className={`px-3 py-1 rounded-full border transition-colors ${
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
            className={`px-3 py-1 rounded-full border transition-colors ${
              year === y
                ? "bg-ridge-orange text-white border-transparent"
                : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      <DataTable
        rows={plays}
        columns={columns}
        searchPlaceholder="Search plays..."
        emptyMessage="No plays yet."
        defaultSortKey="date"
      />
    </div>
  );
}
