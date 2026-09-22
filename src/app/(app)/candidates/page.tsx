import { createClient } from "@/lib/supabase/server";
import CandidatesList, { type CandidateListRow } from "@/components/CandidatesList";

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

  // Flattened into plain, serializable rows here -- CandidatesList is a
  // Client Component (it needs interactive search + the inline-edit
  // components), so everything it receives has to cross the Server/Client
  // boundary as plain data, not Maps or JSX built server-side.
  const rows: CandidateListRow[] = candidates.map((c) => ({
    id: c.id,
    email: c.email,
    inferred_name: c.inferred_name,
    inferred_phone: c.inferred_phone,
    matched_company_id: c.matched_company_id,
    companyLabel: c.matched_company_id
      ? (companyById.get(c.matched_company_id) ?? c.inferred_company_name ?? "Unknown")
      : null,
    matched_event_id: c.matched_event_id,
    eventLabel: c.matched_event_id
      ? (eventById.get(c.matched_event_id) ?? c.inferred_event_name ?? "Unknown")
      : null,
    subject: c.subject,
    bodySnippet: c.body_snippet,
  }));

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Candidates</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {rows.length} to review — pulled from Greg&apos;s and Justin&apos;s inboxes by the weekly
        scan. Fix a guess inline if it&apos;s wrong, then add it to Base Camp or dismiss it.
      </p>

      <CandidatesList rows={rows} />
    </div>
  );
}
