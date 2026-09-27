import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import DedupRowActions from "@/components/inline/DedupRowActions";
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
  pending_state_review: boolean;
  dedup_uncertain: boolean;
  dedup_match_id: string | null;
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

// Needs Dedup Check gets one extra column in place of Contacts (rarely
// populated on a same-day discovery find anyway) -- the resolve actions
// need real width, and cramming them into the Name cell would make every
// other view's Name column pay for a feature only this one filter uses.
const dedupColumns: ColumnMeta[] = [
  { key: "name", label: "Name", sortable: true, width: "18%" },
  { key: "type", label: "Type", sortable: true, width: "8%" },
  { key: "city", label: "City", sortable: true, width: "12%" },
  { key: "state", label: "State", sortable: true, width: "6%" },
  { key: "capacity", label: "Capacity", sortable: true, width: "8%" },
  { key: "setting", label: "Setting", width: "10%" },
  { key: "dedup", label: "Resolve", width: "38%" },
];

function toRow(
  c: CompanyRow,
  dedupMatchName: Map<string, string>
): DataRow {
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
          {c.pending_state_review && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Pending Review
            </span>
          )}
          {c.dedup_uncertain && (
            <span className="text-xs px-1.5 py-0.5 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-400">
              Needs Dedup Check
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
      dedup: c.dedup_uncertain ? (
        <DedupRowActions
          table="companies"
          id={c.id}
          matchId={c.dedup_match_id}
          matchLabel={c.dedup_match_id ? (dedupMatchName.get(c.dedup_match_id) ?? "Unknown") : null}
          matchHref={c.dedup_match_id ? `/companies/${c.dedup_match_id}` : null}
        />
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
      "id, name, type, city, state, capacity, is_indoor, is_outdoor, archived, pending_state_review, dedup_uncertain, dedup_match_id, contacts(id, full_name)"
    )
    .order("name");

  // Discovery-sourced rows still pending their state's sample review stay
  // hidden here, same treatment as archived -- see companies.pending_state_review.
  if (activeFilter === "active")
    query = query.eq("archived", false).eq("pending_state_review", false);
  if (activeFilter === "archived") query = query.eq("archived", true);
  if (activeFilter === "dedup-check")
    query = query.eq("dedup_uncertain", true).eq("archived", false);

  const { data } = await query;
  const companies = (data ?? []) as unknown as CompanyRow[];

  // Matched companies aren't a declared FK the DataRow embed can follow
  // (dedup_match_id is a plain uuid, same reasoning as candidates.
  // matched_company_id in candidates/page.tsx) -- one small separate
  // lookup rather than a second round-trip per row.
  const dedupMatchIds = Array.from(
    new Set(companies.map((c) => c.dedup_match_id).filter((v): v is string => !!v))
  );
  const { data: dedupMatches } = dedupMatchIds.length
    ? await supabase.from("companies").select("id, name").in("id", dedupMatchIds)
    : { data: [] as { id: string; name: string }[] };
  const dedupMatchName = new Map(
    (dedupMatches ?? []).map((m) => [m.id as string, m.name as string])
  );

  const filterPills = (
    <>
      {[
        { key: "active", label: "Active" },
        { key: "dedup-check", label: "Needs Dedup Check" },
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
        rows={companies.map((c) => toRow(c, dedupMatchName))}
        columns={activeFilter === "dedup-check" ? dedupColumns : columns}
        searchPlaceholder="Search venues..."
        emptyMessage="No companies yet."
        defaultSortKey="name"
        toolbarLeft={filterPills}
        toolbarRight={<NewRecordButton />}
      />
    </div>
  );
}
