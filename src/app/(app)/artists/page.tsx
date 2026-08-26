import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

type ArtistRow = {
  id: string;
  name: string;
  status: string;
  ridge_manages: boolean;
  ridge_books: boolean;
  archived: boolean;
  plays: { count: number }[] | null;
};

function relationshipLabel(manages: boolean, books: boolean) {
  if (manages && books) return "Managed & Booked";
  if (manages) return "Managed by The Ridge";
  if (books) return "Booked by The Ridge";
  return "External";
}

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "30%" },
  { key: "status", label: "Status", sortable: true, width: "18%" },
  { key: "relationship", label: "Relationship", width: "32%" },
  { key: "plays", label: "Plays", sortable: true, align: "right", width: "20%" },
];

function toRow(a: ArtistRow): DataRow {
  const playCount = a.plays?.[0]?.count ?? 0;
  return {
    id: a.id,
    cells: {
      name: (
        <span className="inline-flex items-center gap-2">
          <Link
            href={`/artists/${a.id}`}
            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
          >
            {a.name}
          </Link>
          {a.archived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Archived
            </span>
          )}
        </span>
      ),
      status: <span className="capitalize">{a.status}</span>,
      relationship: relationshipLabel(a.ridge_manages, a.ridge_books),
      plays: playCount,
    },
    sortValues: {
      name: a.name,
      status: a.status,
      plays: playCount,
    },
    searchText: [a.name, a.status].filter(Boolean).join(" ").toLowerCase(),
  };
}

export default async function ArtistsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter = status ?? "active";

  const supabase = await createClient();
  let query = supabase
    .from("artists")
    .select("id, name, status, ridge_manages, ridge_books, archived, plays(count)")
    .order("name");

  if (activeFilter === "active") query = query.eq("archived", false);
  if (activeFilter === "archived") query = query.eq("archived", true);

  const { data } = await query;
  const artists = (data ?? []) as unknown as ArtistRow[];

  const filterPills = (
    <>
      {[
        { key: "active", label: "Active" },
        { key: "archived", label: "Archived" },
        { key: "all", label: "All" },
      ].map((f) => (
        <a
          key={f.key}
          href={`/artists?status=${f.key}`}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeFilter === f.key
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
      <h1 className="font-display text-3xl font-medium mb-1">Artists</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {artists.length} records
      </p>

      <DataTable
        rows={artists.map(toRow)}
        columns={columns}
        searchPlaceholder="Search artists..."
        emptyMessage="No artists yet."
        defaultSortKey="name"
        toolbarLeft={filterPills}
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
