import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { scanMailbox, type ScannedCandidate } from "@/lib/gmailScan";
import { sendContactDigestEmail } from "@/lib/contactDigestEmail";

// Weekly contact auto-discovery, Phase 1. Scans Greg's and Justin's Ridge
// inboxes for email addresses that might be genuinely new contacts/venues,
// records them in `candidates` so nothing resurfaces once handled, and
// emails a digest of what's new this run. See the "Base Camp -- Weekly
// Contact Auto-Discovery" plan for the full design.
//
// Triggered by Vercel Cron (see vercel.json, Mondays 14:00 UTC), which
// sends `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=`
// query param is also accepted for manual/local testing (`curl`), and an
// optional `?days=N` overrides the normal 8-day lookback window (`?days=0`
// or `?days=all` means unbounded -- the entire mailbox).
//
// IMPORTANT -- do not use `?days=0`/`all` against the *deployed* route: The
// Ridge's Vercel plan is Hobby, which hard-caps every serverless function
// at 60s (see maxDuration below -- already set to that ceiling) regardless
// of any greater value configured here. A one-time full-history backfill
// across two mailboxes -- one Gmail API round trip per message -- will
// almost certainly blow past that and just time out with partial results.
// Run that specific backfill against `next dev` on a real machine instead
// (this exact route, same code, just no serverless time limit), then let
// the deployed route take over for the normal weekly 8-day-window runs,
// which comfortably fit in 60s.
const GREG_MAILBOX = "gburroughs@theridgemusicgroup.com";
const JUSTIN_MAILBOX = "jmayotte@theridgemusicgroup.com";

// Raise Hobby's default 10s timeout to its own 60s ceiling -- the most this
// plan allows a serverless function to run, regardless of a larger value
// here. Even a normal weekly run benefits from the extra margin.
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

// Best-guess a company match by comparing the candidate's email domain
// against every company's website domain. Free-text `website` values are
// normalized (protocol/www/trailing-slash stripped) before comparing --
// most values in the table today don't have a scheme at all, so this falls
// back to treating the whole string as a hostname when URL parsing fails.
function normalizeWebsiteDomain(website: string): string | null {
  const trimmed = website.trim();
  if (!trimmed) return null;
  try {
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const hostname = new URL(withScheme).hostname.toLowerCase();
    return hostname.replace(/^www\./, "") || null;
  } catch {
    return trimmed.toLowerCase().replace(/^www\./, "").replace(/\/.*$/, "") || null;
  }
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const daysRaw = url.searchParams.get("days");
  const lookbackDays =
    daysRaw === "0" || daysRaw === "all"
      ? 0
      : Number.isFinite(Number(daysRaw)) && Number(daysRaw) > 0
        ? Number(daysRaw)
        : 8;

  const supabase = createServiceRoleClient();

  // 1. Scan both inboxes and dedup this run's own results by lowercased
  // email -- if the same address turns up in both mailboxes, keep whichever
  // copy was seen first (Greg's) and just take its inferred name.
  let scanned: ScannedCandidate[] = [];
  try {
    const [greg, justin] = await Promise.all([
      scanMailbox(GREG_MAILBOX, "greg", lookbackDays),
      scanMailbox(JUSTIN_MAILBOX, "justin", lookbackDays),
    ]);
    const byEmail = new Map<string, ScannedCandidate>();
    for (const c of [...greg, ...justin]) {
      const existing = byEmail.get(c.email);
      if (existing) {
        if (!existing.inferredName && c.inferredName) existing.inferredName = c.inferredName;
      } else {
        byEmail.set(c.email, c);
      }
    }
    scanned = Array.from(byEmail.values());
  } catch (err) {
    console.error("scan-contacts: Gmail scan failed", err);
    // Auth/config problems (missing env var, scope not yet authorized in
    // Workspace admin, etc) are common until Greg finishes the manual
    // setup -- 200 so Vercel Cron doesn't treat this as a crash-loop, but
    // the error is fully logged for Greg to check.
    return NextResponse.json({ ok: false, error: "gmail scan failed, see logs" });
  }

  // 2. Filter out anything already a contact, and anything on a
  // Greg-curated always-exclude domain.
  const [{ data: existingContacts }, { data: excludedDomains }] = await Promise.all([
    supabase.from("contacts").select("email").not("email", "is", null),
    supabase.from("domain_rules").select("domain_normalized").eq("rule", "always_exclude"),
  ]);

  const existingEmails = new Set(
    (existingContacts ?? []).map((c) => (c.email as string).toLowerCase())
  );
  const excludedDomainSet = new Set((excludedDomains ?? []).map((d) => d.domain_normalized as string));

  const filtered = scanned.filter((c) => {
    if (existingEmails.has(c.email)) return false;
    const domain = c.email.split("@")[1];
    if (domain && excludedDomainSet.has(domain)) return false;
    return true;
  });

  // 3. Best-guess a company match against every company with a website on
  // file (only 245 companies today -- cheap to load in full).
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, website")
    .not("website", "is", null);

  const companyByDomain = new Map<string, { id: string; name: string }>();
  for (const company of companies ?? []) {
    const domain = normalizeWebsiteDomain(company.website as string);
    if (domain && !companyByDomain.has(domain)) {
      companyByDomain.set(domain, { id: company.id as string, name: company.name as string });
    }
  }

  type EnrichedCandidate = ScannedCandidate & {
    matchedCompanyId: string | null;
    inferredCompanyName: string | null;
    inferredCompanyDomain: string | null;
  };

  const enriched: EnrichedCandidate[] = filtered.map((c) => {
    const domain = c.email.split("@")[1] ?? null;
    const match = domain ? companyByDomain.get(domain) : undefined;
    return {
      ...c,
      matchedCompanyId: match?.id ?? null,
      inferredCompanyName: match?.name ?? null,
      inferredCompanyDomain: domain,
    };
  });

  // 4. Upsert into candidates: repeats just get last_seen_at/times_seen
  // bumped (status untouched, so a dismissed/imported address never
  // resurfaces); brand-new addresses get inserted and collected for the
  // digest.
  const { data: existingCandidates } = await supabase
    .from("candidates")
    .select("id, email_normalized, times_seen")
    .in(
      "email_normalized",
      enriched.map((c) => c.email)
    );

  const existingByEmail = new Map(
    (existingCandidates ?? []).map((c) => [c.email_normalized as string, c])
  );

  const toInsert = enriched.filter((c) => !existingByEmail.has(c.email));
  const toBump = enriched.filter((c) => existingByEmail.has(c.email));

  const newThisRun: EnrichedCandidate[] = [];

  if (toInsert.length > 0) {
    const { data: inserted, error } = await supabase
      .from("candidates")
      .insert(
        toInsert.map((c) => ({
          email: c.email,
          inferred_name: c.inferredName,
          inferred_company_name: c.inferredCompanyName,
          inferred_company_domain: c.inferredCompanyDomain,
          matched_company_id: c.matchedCompanyId,
          source: c.source,
          source_message_ref: c.sourceMessageRef,
        }))
      )
      .select("email");

    if (error) {
      console.error("scan-contacts: failed to insert new candidates", error);
    } else {
      const insertedEmails = new Set((inserted ?? []).map((r) => r.email as string));
      newThisRun.push(...toInsert.filter((c) => insertedEmails.has(c.email)));
    }
  }

  for (const c of toBump) {
    const existing = existingByEmail.get(c.email)!;
    const { error } = await supabase
      .from("candidates")
      .update({
        last_seen_at: new Date().toISOString(),
        times_seen: (existing.times_seen as number) + 1,
      })
      .eq("id", existing.id as string);
    if (error) {
      console.error(`scan-contacts: failed to bump times_seen for ${c.email}`, error);
    }
  }

  // 5. Digest only newThisRun -- a repeat from a prior week never shows up
  // again even though its times_seen just went up.
  await sendContactDigestEmail(
    newThisRun.map((c) => ({
      email: c.email,
      inferredName: c.inferredName,
      inferredCompanyName: c.inferredCompanyName,
    }))
  );

  return NextResponse.json({
    ok: true,
    scanned: scanned.length,
    filtered: filtered.length,
    newThisRun: newThisRun.length,
    bumped: toBump.length,
  });
}
