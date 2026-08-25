import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

type CompanyRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state: string | null;
  contacts: { id: string; full_name: string }[] | null;
};

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true },
  { key: "type", label: "Type", sortable: true },
  { key: "city", label: "City", sortable: true },
  { key: "state", label: "State", sortable: true },
  { key: "contacts", label: "Contacts" },
];

function toRow(c: CompanyRow): DataRow {
  return {
    id: c.id,
    cells: {
      name: (
        <Link
          href={`/companies/${c.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {c.name}
        </Link>
      ),
      type: <span className="capitalize">{c.type}</span>,
      city: c.city ?? "—",
      state: c.state ?? "—",
      contacts: c.contacts?.length ? (
        <span className="space-x-1">
          {c.contacts.map((contact, i) => (
            <span key={contact.id}>
              <Link
                href={`/contacts/${contact.id}`}
                className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {contact.full_name}
              </Link>
              {i < c.contacts!.length - 1 ? "," : ""}
            </span>
          ))}
        </span>
      ) : (
        "—"
      ),
    },
    sortValues: {
      name: c.name,
      type: c.type,
      city: c.city,
      state: c.state,
    },
    searchText: [c.name, c.type, c.city, c.state, c.contacts?.map((x) => x.full_name).join(" ")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, type, city, state, contacts(id, full_name)")
    .order("name");
  const companies = (data ?? []) as unknown as CompanyRow[];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Venues</h1>
        <NewRecordButton />
      </div>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {companies.length} records
      </p>

      <DataTable
        rows={companies.map(toRow)}
        columns={columns}
        searchPlaceholder="Search venues..."
        emptyMessage="No companies yet."
        defaultSortKey="name"
      />
    </div>
  );
}
