import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DataTable, { type Column } from "@/components/DataTable";

type Company = { id: string; name: string; city: string | null; state: string | null };
type ContactRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  title: string | null;
  companies: Company | null;
};

const columns: Column<ContactRow>[] = [
  {
    key: "name",
    label: "Name",
    render: (c) => (
      <Link
        href={`/contacts/${c.id}`}
        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        {c.full_name}
      </Link>
    ),
    sortValue: (c) => c.full_name,
    searchValue: (c) => c.full_name,
  },
  {
    key: "company",
    label: "Company",
    render: (c) =>
      c.companies ? (
        <Link
          href={`/companies/${c.companies.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {c.companies.name}
        </Link>
      ) : (
        "—"
      ),
    sortValue: (c) => c.companies?.name ?? null,
    searchValue: (c) => c.companies?.name ?? "",
  },
  {
    key: "city",
    label: "City",
    render: (c) => c.companies?.city ?? "—",
    sortValue: (c) => c.companies?.city ?? null,
    searchValue: (c) => c.companies?.city ?? "",
  },
  {
    key: "state",
    label: "State",
    render: (c) => c.companies?.state ?? "—",
    sortValue: (c) => c.companies?.state ?? null,
    searchValue: (c) => c.companies?.state ?? "",
  },
  {
    key: "email",
    label: "Email",
    render: (c) => c.email ?? "—",
    sortValue: (c) => c.email ?? null,
    searchValue: (c) => c.email ?? "",
  },
  {
    key: "phone",
    label: "Phone",
    render: (c) => c.phone ?? "—",
    sortValue: (c) => c.phone ?? null,
    searchValue: (c) => c.phone ?? "",
  },
  {
    key: "title",
    label: "Title",
    render: (c) => c.title ?? "—",
    sortValue: (c) => c.title ?? null,
    searchValue: (c) => c.title ?? "",
  },
];

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, companies(id, name, city, state)")
    .order("full_name");
  const contacts = (data ?? []) as unknown as ContactRow[];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Contacts</h1>
        <NewRecordButton />
      </div>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {contacts.length} people
      </p>

      <DataTable
        rows={contacts}
        columns={columns}
        searchPlaceholder="Search contacts..."
        emptyMessage="No contacts yet."
        defaultSortKey="name"
      />
    </div>
  );
}
