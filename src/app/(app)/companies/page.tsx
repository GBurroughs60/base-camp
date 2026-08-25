import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type Column } from "@/components/DataTable";

type CompanyRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state: string | null;
  contacts: { id: string; full_name: string }[] | null;
};

const columns: Column<CompanyRow>[] = [
  {
    key: "name",
    label: "Name",
    render: (c) => (
      <Link
        href={`/companies/${c.id}`}
        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        {c.name}
      </Link>
    ),
    sortValue: (c) => c.name,
    searchValue: (c) => c.name,
  },
  {
    key: "type",
    label: "Type",
    render: (c) => <span className="capitalize">{c.type}</span>,
    sortValue: (c) => c.type,
    searchValue: (c) => c.type,
  },
  {
    key: "city",
    label: "City",
    render: (c) => c.city ?? "—",
    sortValue: (c) => c.city,
    searchValue: (c) => c.city ?? "",
  },
  {
    key: "state",
    label: "State",
    render: (c) => c.state ?? "—",
    sortValue: (c) => c.state,
    searchValue: (c) => c.state ?? "",
  },
  {
    key: "contacts",
    label: "Contacts",
    render: (c) =>
      c.contacts?.length ? (
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
    searchValue: (c) => c.contacts?.map((x) => x.full_name).join(" ") ?? "",
  },
];

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
        rows={companies}
        columns={columns}
        searchPlaceholder="Search venues..."
        emptyMessage="No companies yet."
        defaultSortKey="name"
      />
    </div>
  );
}
