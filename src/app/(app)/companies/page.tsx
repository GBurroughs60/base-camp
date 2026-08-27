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
  capacity: number | null;
  is_indoor: boolean;
  is_outdoor: boolean;
  archived: boolean;
  contacts: { id: string; full_name: string }[] | null;
};

function settingLabel(c: Pick<CompanyRow, "is_indoor" | "is_outdoor">) {
  if (c.is_indoor && c.is_outdoor) return "Indoor & Outdoor";
  if (c.is_indoor) return "Indoor";
  if (c.is_outdoor) return "Outdoor";
  return null;
}

const columns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "21%" },
  { key: "type", label: "Type", sortable: true, width: "9%" },
  { key: "city", label: "City", sortable: true, width: "14%" },
  { key: "state", label: "State", sortable: true, width: "7%" },
  { key: "capacity", label: "Capacity", sortable: true, width: "9%" },
  { key: "setting", label: "Setting", width: "12%" },
  { key: "contacts", label: "Contacts", width: "28%" },
];

function toRow(c: CompanyRow): DataRow {
  return {
    id: c.id,
    cells: {
      name: (
        <span className="inline-flex items-center gap-2">
          <Link
            href={`/companies/${c.id}`}
            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
          >
            {c.name}
          </Link>
          {c.archived && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Archived
            </span>
          )}
        </span>
      ),
      type: <span className="capitalize">{c.type}</span>,
      city: c.city ?? "—",
      state: c.state ?? "—",
      capacity: c.capacity !== null ? c.capacity.toLocaleString("en-US") : "—",
      setting: settingLabel(c) ?? "—",
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
      capacity: c.capacity,
    },
    searchText: [
      c.name,
      c.type,
      c.city,
      c.state,
      settingLabel(c),
      c.contacts?.map((x) => x.full_name).join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export default async function CompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const activeFilter = status ?? "active";

  const supabase = await createClient();
  let query = supabase
    .from("companies")
    .select(
      "id, name, type, city, state, capacity, is_indoor, is_outdoor, archived, contacts(id, full_name)"
    )
    .order("name");

  if (activeFilter === "active") query = query.eq("archived", false);
  if (activeFilter === "archived") query = query.eq("archived", true);

  const { data } = await query;
  const companies = (data ?? []) as unknown as CompanyRow[];

  const filterPills = (
    <>
      {[
        { key: "active", label: "Active" },
        { key: "archived", label: "Archived" },
        { key: "all", label: "All" },
      ].map((f) => (
        <a
          key={f.key}
          href={`/companies?status=${f.key}`}
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
      <h1 className="font-display text-3xl font-medium mb-1">Venues</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {companies.length} records
      </p>

      <DataTable
        rows={companies.map(toRow)}
        columns={columns}
        searchPlaceholder="Search venues..."
        emptyMessage="No companies yet."
        defaultSortKey="name"
        toolbarLeft={filterPills}
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
