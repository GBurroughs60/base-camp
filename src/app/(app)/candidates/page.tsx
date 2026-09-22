import { createClient } from "@/lib/supabase/server";
import DataTable, { type ColumnMeta, type DataRow } from "@/components/DataTable";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineRelationField from "@/components/inline/InlineRelationField";
import CandidateRowActions from "@/components/inline/CandidateRowActions";

type CandidateRow = {
  id: string;
  email: string;
  inferred_name: string | null;
  inferred_phone: string | null;
  inferred_company_name: string | null;
  matched_company_id: string | null;
  inferred_event_name: string | null;
  matched_event_id: string | null;
  subject: string | null;
  body_snippet: string | null;
};

const columns: ColumnMeta[] = [
  { key: "email", label: "Email", sortable: true, width: "18%" },
  { key: "name", label: "Name", sortable: true, width: "13%" },
  { key: "company", label: "Company / Venue", sortable: true, width: "15%" },
  { key: "event", label: "Event", sortable: true, width: "12%" },
  { key: "phone", label: "Phone", sortable: true, width: "12%" },
  { key: "context", label: "Context", width: "16%" },
  { key: "actions", label: "", width: "14%" },
];

function toRow(
  c: CandidateRow,
  companyById: Map<string, string>,
  eventById: Map<string, string>
): DataRow {
  const companyLabel = c.matched_company_id
    ? (companyById.get(c.matched_company_id) ?? c.inferred_company_name ?? "Unknown")
    : null;
  const eventLabel = c.matched_event_id
    ? (eventById.get(c.matched_event_id) ?? c.inferred_event_name ?? "Unknown")
    : null;
  const context = [c.subject, c.body_snippet].filter(Boolean).join(" — ");

  return {
    id: c.id,
    cells: {
      email: (
        <a
          href={`mailto:${c.email}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {c.email}
        </a>
      ),
      name: (
        <InlineEditField
          table="candidates"
          id={c.id}
          field="inferred_name"
          value={c.inferred_name}
          placeholder="Add name"
        />
      ),
      company: (
        <InlineRelationField
          table="candidates"
          id={c.id}
          field="matched_company_id"
          relatedTable="companies"
          value={c.matched_company_id ? { id: c.matched_company_id, label: companyLabel! } : null}
          placeholder="Add venue"
        />
      ),
      event: (
        <InlineRelationField
          table="candidates"
          id={c.id}
          field="matched_event_id"
          relatedTable="events"
          value={c.matched_event_id ? { id: c.matched_event_id, label: eventLabel! } : null}
          placeholder="Add event"
        />
      ),
      phone: (
        <InlineEditField
          table="candidates"
          id={c.id}
          field="inferred_phone"
          value={c.inferred_phone}
          placeholder="Add phone"
        />
      ),
      context: context ? (
        <span
          title={context}
          className="text-xs text-black/50 dark:text-white/50 line-clamp-2"
        >
          {context}
        </span>
      ) : (
        <span className="text-xs text-black/30 dark:text-white/30">—</span>
      ),
      actions: (
        <CandidateRowActions
          candidateId={c.id}
          name={c.inferred_name}
          email={c.email}
          phone={c.inferred_phone}
          companyId={c.matched_company_id}
          eventId={c.matched_event_id}
        />
      ),
    },
    sortValues: {
      email: c.email,
      name: c.inferred_name,
      company: companyLabel,
      event: eventLabel,
      phone: c.inferred_phone,
    },
    searchText: [c.email, c.inferred_name, companyLabel, eventLabel, c.inferred_phone, context]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
  };
}

export default async function CandidatesPage() {
  const supabase = await createClient();

  // "New" candidates only -- imported/dismissed rows drop off this list
  // for good (status untouched on a repeat sighting, so nothing that's
  // already been handled can resurface here). Rows from before this
  // column existed have no status at all, hence the null check alongside
  // "new".
  const { data } = await supabase
    .from("candidates")
    .select(
      "id, email, inferred_name, inferred_phone, inferred_company_name, matched_company_id, inferred_event_name, matched_event_id, subject, body_snippet, first_seen_at"
    )
    .or("status.is.null,status.eq.new")
    .order("first_seen_at", { ascending: false });

  const candidates = (data ?? []) as unknown as CandidateRow[];

  // Loaded as two small separate lookups rather than a PostgREST embed --
  // matched_company_id/matched_event_id are plain uuid columns, not
  // declared foreign keys the way plays.venue_id is, so there's no
  // guaranteed embed relationship to select through. Cheap either way:
  // at most a couple hundred distinct ids.
  const companyIds = Array.from(
    new Set(candidates.map((c) => c.matched_company_id).filter((v): v is string => !!v))
  );
  const eventIds = Array.from(
    new Set(candidates.map((c) => c.matched_event_id).filter((v): v is string => !!v))
  );

  const [{ data: companies }, { data: events }] = await Promise.all([
    companyIds.length
      ? supabase.from("companies").select("id, name").in("id", companyIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    eventIds.length
      ? supabase.from("events").select("id, name").in("id", eventIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const companyById = new Map((companies ?? []).map((c) => [c.id as string, c.name as string]));
  const eventById = new Map((events ?? []).map((e) => [e.id as string, e.name as string]));

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Candidates</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {candidates.length} to review — pulled from Greg&apos;s and Justin&apos;s inboxes by the
        weekly scan. Fix a guess inline if it&apos;s wrong, then add it to Base Camp or dismiss it.
      </p>

      <DataTable
        rows={candidates.map((c) => toRow(c, companyById, eventById))}
        columns={columns}
        searchPlaceholder="Search candidates..."
        emptyMessage="No new candidates right now -- check back after the next weekly scan."
        defaultSortKey="email"
      />
    </div>
  );
}
