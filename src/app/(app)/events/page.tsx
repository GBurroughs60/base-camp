import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type Column } from "@/components/DataTable";

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

const columns: Column<EventRow>[] = [
  {
    key: "name",
    label: "Name",
    render: (e) => (
      <Link
        href={`/events/${e.id}`}
        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        {e.name}
      </Link>
    ),
    sortValue: (e) => e.name,
    searchValue: (e) => e.name,
  },
  {
    key: "venue",
    label: "Venue",
    render: (e) =>
      e.companies ? (
        <Link
          href={`/companies/${e.companies.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {e.companies.name}
        </Link>
      ) : (
        "—"
      ),
    sortValue: (e) => e.companies?.name ?? null,
    searchValue: (e) => e.companies?.name ?? "",
  },
  {
    key: "city",
    label: "City",
    render: (e) => e.city ?? "—",
    sortValue: (e) => e.city,
    searchValue: (e) => e.city ?? "",
  },
  {
    key: "state",
    label: "State",
    render: (e) => e.state ?? (e.country && e.country !== "USA" ? e.country : "—"),
    sortValue: (e) => e.state ?? e.country,
    searchValue: (e) => [e.state, e.country].filter(Boolean).join(" "),
  },
  {
    key: "contact",
    label: "Contact",
    render: (e) =>
      e.contacts ? (
        <Link
          href={`/contacts/${e.contacts.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {e.contacts.full_name}
        </Link>
      ) : (
        "—"
      ),
    sortValue: (e) => e.contacts?.full_name ?? null,
    searchValue: (e) => e.contacts?.full_name ?? "",
  },
  {
    key: "visibility",
    label: "Visibility",
    render: (e) => (e.is_public ? "Public" : "Private"),
    sortValue: (e) => (e.is_public ? "Public" : "Private"),
    searchValue: (e) => (e.is_public ? "Public" : "Private"),
  },
];

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
        rows={events}
        columns={columns}
        searchPlaceholder="Search events..."
        emptyMessage="No events yet."
        defaultSortKey="name"
      />
    </div>
  );
}
