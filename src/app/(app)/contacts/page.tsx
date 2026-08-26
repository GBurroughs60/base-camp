import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";

type Company = { id: string; name: string; city: string | null; state: string | null };
type ContactRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companies: Company | null;
};

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "14%" },
  { key: "company", label: "Company", sortable: true, width: "12%" },
  { key: "city", label: "City", sortable: true, width: "8%" },
  { key: "state", label: "State", sortable: true, width: "7%" },
  { key: "email", label: "Email", sortable: true, width: "28%" },
  { key: "phone", label: "Phone", sortable: true, width: "14%" },
  { key: "title", label: "Title", sortable: true, width: "17%" },
];

function toRow(c: ContactRow): DataRow {
  return {
    id: c.id,
    cells: {
      name: (
        <Link
          href={`/contacts/${c.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {c.full_name}
        </Link>
      ),
      company: c.companies ? (
        <Link
          href={`/companies/${c.companies.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {c.companies.name}
        </Link>
      ) : (
        "—"
      ),
      city: c.companies?.city ?? "—",
      state: c.companies?.state ?? "—",
      email: c.email ?? "—",
      phone: c.phone ?? "—",
      title: c.title ?? "—",
    },
    sortValues: {
      name: c.full_name,
      company: c.companies?.name ?? null,
      city: c.companies?.city ?? null,
      state: c.companies?.state ?? null,
      email: c.email,
      phone: c.phone,
      title: c.title,
    },
    searchText: [
      c.full_name,
      c.companies?.name,
      c.companies?.city,
      c.companies?.state,
      c.email,
      c.phone,
      c.title,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, companies(id, name, city, state)")
    .order("full_name");
  const contacts = (data ?? []) as unknown as ContactRow[];

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Contacts</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {contacts.length} records
      </p>

      <DataTable
        rows={contacts.map(toRow)}
        columns={columns}
        searchPlaceholder="Search contacts..."
        emptyMessage="No contacts yet."
        defaultSortKey="name"
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
