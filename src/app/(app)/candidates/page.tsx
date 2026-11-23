import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
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

// Near-duplicate hint, e.g. kmarsh@isleofpalms.gov / kmarsh@iop.net -- the
// same person at the same job, reachable at two addresses (a .gov domain
// retired for a shorter one, a venue's own domain alongside a personal
// one, etc). Deliberately narrow and advisory-only: same local part
// (before the @, case-insensitive, any "+tag" stripped), different
// domain, both still pending review. It does NOT merge, dismiss, or touch
// either row -- just a note in the UI so a reviewer isn't the one who has
// to notice two emails share the same person by scanning the list
// themselves. A fuzzier match (comparing inferred_name, or "kim.marsh" vs
// "kmarsh") would catch more real duplicates but with real false-positive
// risk too -- not worth it for an advisory hint, so left out.
const GENERIC_LOCAL_PARTS = new Set([
  "info",
  "office",
  "events",
  "event",
  "contact",
  "booking",
  "bookings",
  "admin",
  "hello",
  "team",
  "tourism",
  "marketing",
  "press",
  "media",
  "membership",
  "boxoffice",
  "frontdesk",
  "reservations",
  "sales",
  "support",
  "general",
  "mail",
  "staff",
  "director",
  "manager",
  "coordinator",
]);

function normalizedLocalPart(email: string): string {
  const [local] = email.toLowerCase().split("@");
  return (local ?? "").split("+")[0];
}

function domainOf(email: string): string {
  return email.toLowerCase().split("@")[1] ?? "";
}

export default async function CandidatesPage() {
  // Admin-only (2026-11-09, per Greg) -- see src/lib/admin.ts. A hidden
  // Nav.tsx link alone doesn't stop a direct URL visit; this is the half
  // that actually enforces it, silently redirecting a non-admin to "/".
  await requireAdmin();
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

  const allCandidates = (data ?? []) as unknown as CandidateRow[];

  // Drop anything whose email already belongs to a contact. The scan only
  // ever checks this at insert time (scan-contacts/route.ts step 2) -- a
  // candidate inserted BEFORE that address became a contact (added
  // manually, or from a different lead) has no way to get re-checked
  // later and would otherwise sit on this list forever even though it's
  // already handled. Filtered here at page load rather than written back
  // to the row: nothing is deleted or marked, so if a contact is later
  // removed the candidate (still a "new" row underneath) would simply
  // reappear -- which is the right behavior, not a bug to guard against.
  const { data: existingContacts } = await supabase
    .from("contacts")
    .select("email")
    .not("email", "is", null);
  const existingContactEmails = new Set(
    (existingContacts ?? []).map((c) => (c.email as string).toLowerCase())
  );
  const candidates = allCandidates.filter(
    (c) => !existingContactEmails.has(c.email.toLowerCase())
  );

  // Group still-pending candidates by local part for the near-duplicate
  // hint below (see GENERIC_LOCAL_PARTS' comment) -- built once up front
  // rather than re-scanning the full list per row.
  const byLocalPart = new Map<string, CandidateRow[]>();
  for (const c of candidates) {
    const local = normalizedLocalPart(c.email);
    if (!local || local.length < 4 || GENERIC_LOCAL_PARTS.has(local)) continue;
    const group = byLocalPart.get(local) ?? [];
    group.push(c);
    byLocalPart.set(local, group);
  }

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
    possibleDuplicateEmails: (() => {
      const matches = (byLocalPart.get(normalizedLocalPart(c.email)) ?? [])
        .filter((other) => other.id !== c.id && domainOf(other.email) !== domainOf(c.email))
        .map((other) => other.email);
      return matches.length ? matches : null;
    })(),
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
