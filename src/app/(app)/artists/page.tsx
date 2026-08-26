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
  plays: { count: number }[] | null;
};

function relationshipLabel(manages: boolean, books: boolean) {
  if (manages && books) return "Managed & Booked";
  if (manages) return "Managed by The Ridge";
  if (books) return "Booked by The Ridge";
  return "External";
}

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "status", label: "Status", sortable: true },
  { key: "relationship", label: "Relationship" },
  { key: "plays", label: "Plays", sortable: true, align: "right" },
];

function toRow(a: ArtistRow): DataRow {
  const playCount = a.plays?.[0]?.count ?? 0;
  return {
    id: a.id,
    cells: {
      name: (
        <Link
          href={`/artists/${a.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {a.name}
        </Link>
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

export default async function ArtistsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("artists")
    .select("id, name, status, ridge_manages, ridge_books, plays(count)")
    .order("name");
  const artists = (data ?? []) as unknown as ArtistRow[];

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Artists</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {artists.length} records
      </p>

      <DataTable
        rows={artists.map(toRow)}
        columns={columns}
        searchPlaceholder="Search artists..."
        emptyMessage="No artists yet."
        defaultSortKey="name"
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
