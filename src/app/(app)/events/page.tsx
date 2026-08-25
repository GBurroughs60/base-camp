import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

type EventRow = {
  id: string;
  name: string;
  is_public: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  companies: { id: string; name: string } | null;
  contacts: { id: string; full_name: string } | null;
};

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "venue", label: "Venue", sortable: true },
  { key: "city", label: "City", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "contact", label: "Contact", sortable: true },
  { key: "visibility", label: "Visibility", sortable: true },
];

function toRow(e: EventRow): DataRow {
  const stateOrCountry = e.state ?? (e.country && e.country !== "USA" ? e.country : null);
  return {
    id: e.id,
    cells: {
      name: (
        <Link
          href={`/events/${e.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {e.name}
        </Link>
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
  searchParams: Promise<{ visibility?: string }>;
}) {
  const { visibility } = await searchParams;
  const supabase = await createClient();

  const activeFilter = visibility ?? "public";

  let query = supabase
    .from("events")
    .select(
      "id, name, is_public, city, state, country, companies(id, name), contacts(id, full_name)"
    )
    .order("name");

  if (activeFilter === "public") query = query.eq("is_public", true);
  if (activeFilter === "private") query = query.eq("is_public", false);

  const { data } = await query;
  const events = (data ?? []) as unknown as EventRow[];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Events</h1>
        <NewRecordButton />
      </div>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {events.length} events
      </p>

      <div className="flex gap-2 mb-6 text-sm">
        {[
          { key: "public", label: "Public" },
          { key: "private", label: "Private" },
          { key: "all", label: "All" },
        ].map((f) => (
          <a
            key={f.key}
            href={`/events?visibility=${f.key}`}
            className={`px-3 py-1 rounded-full border transition-colors ${
              activeFilter === f.key
                ? "bg-ridge-orange text-white border-transparent"
                : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <DataTable
        rows={events.map(toRow)}
        columns={columns}
        searchPlaceholder="Search events..."
        emptyMessage="No events yet."
        defaultSortKey="name"
      />
    </div>
  );
}
