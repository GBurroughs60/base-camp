import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { scanMailbox, type ScannedCandidate } from "@/lib/gmailScan";
import { sendContactDigestEmail } from "@/lib/contactDigestEmail";

// Weekly contact auto-discovery. Scans Greg's and Justin's Ridge inboxes
// for email addresses that might be genuinely new contacts/venues, records
// them in `candidates` so nothing resurfaces once handled, and emails a
// digest of what's new this run. See the "Base Camp -- Weekly Contact
// Auto-Discovery" and "Richer candidate signals" plans for the full
// design -- the latter added body-based name/company/event/phone
// inference (see gmailScan.ts) on top of this route's original
// header-only, domain-match version.
//
// Triggered by Vercel Cron (see vercel.json, Mondays 14:00 UTC), which
// sends `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=`
// query param is also accepted for manual/local testing (`curl`), and an
// optional `?days=N` overrides the normal 8-day lookback window (`?days=0`
// or `?days=all` means unbounded -- the entire mailbox).
//
// IMPORTANT -- be cautious using `?days=0`/`all` against the *deployed*
// route: The Ridge's Vercel plan is Hobby, which hard-caps every
// serverless function at 300s (5 min -- see maxDuration below, already at
// that ceiling) regardless of any greater value configured here. A normal
// weekly run comfortably fits; a one-time full-history backfill across two
// mailboxes -- one Gmail API round trip per message -- might still exceed
// 5 minutes if either inbox has a large multi-year history. If a manual
// `?days=all` run against the deployed route times out (504), fall back to
// running this exact route via `next dev` on a real machine instead, which
// has no such limit.
const GREG_MAILBOX = "gburroughs@theridgemusicgroup.com";
const JUSTIN_MAILBOX = "jmayotte@theridgemusicgroup.com";

// Hobby's max duration is already 300s by default -- this just makes that
// explicit rather than relying on the platform default.
export const maxDuration = 300;

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

// Escapes a record name for use inside a RegExp -- names can contain
// parens, periods, etc (e.g. "The Fillmore (Denver)").
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Best-guess a venue/event mention in free text (subject + trimmed body) by
// scanning for any known record's name as a whole word/phrase. This is the
// fallback signal alongside (companies) or in place of (events, which have
// no domain to match against at all) the domain-based match above -- same
// "load once per run, substring-match" shape as companyByDomain. Names
// under 4 characters are skipped so a short, common word/abbreviation
// doesn't produce a false positive.
function matchByNameMention<T extends { id: string; name: string }>(
  text: string,
  records: T[]
): T | null {
  if (!text) return null;
  for (const record of records) {
    if (record.name.trim().length < 4) continue;
    const re = new RegExp(`\\b${escapeRegExp(record.name.trim())}\\b`, "i");
    if (re.test(text)) return record;
  }
  return null;
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

  // 2. Filter out anything already a contact, anything on a Greg-curated
  // always-exclude domain, and anything already "inside" a Ridge artist
  // relationship -- a new address at a company Ridge already works with
  // isn't a fresh lead just because that exact address hasn't shown up
  // before (e.g. a second person at an existing artist's management
  // company), and an artist's own personal/promo address is never a lead
  // either even though nothing links it to anything else in the database.
  const [{ data: existingContacts }, { data: excludedDomains }, { data: teamContacts }, { data: activeArtists }] =
    await Promise.all([
      supabase.from("contacts").select("email").not("email", "is", null),
      supabase.from("domain_rules").select("domain_normalized").eq("rule", "always_exclude"),
      supabase.from("contact_artists").select("contacts(email)"),
      supabase.from("artists").select("name").eq("archived", false),
    ]);

  const existingEmails = new Set(
    (existingContacts ?? []).map((c) => (c.email as string).toLowerCase())
  );
  const excludedDomainSet = new Set((excludedDomains ?? []).map((d) => d.domain_normalized as string));

  // Free/consumer webmail providers are deliberately excluded from the
  // team-domain set below -- an artist's manager happening to use Gmail
  // doesn't mean every other Gmail address is "already known", which
  // would silently blackhole most of what this scan is supposed to find.
  const GENERIC_EMAIL_PROVIDERS = new Set([
    "gmail.com",
    "yahoo.com",
    "aol.com",
    "outlook.com",
    "hotmail.com",
    "icloud.com",
    "live.com",
    "msn.com",
    "me.com",
  ]);
  const teamDomains = new Set(
    (teamContacts ?? [])
      .map((row) => (row.contacts as unknown as { email: string | null } | null)?.email)
      .filter((e): e is string => !!e)
      .map((e) => e.toLowerCase().split("@")[1])
      .filter((d): d is string => !!d && !GENERIC_EMAIL_PROVIDERS.has(d))
  );

  // Catches an artist's own address (e.g. brittanyelisemusic1@gmail.com
  // for "Brittany Elise") even though nothing in the database links that
  // specific address to anything -- there's no domain or contact row to
  // match against, only the name itself showing up in the address. A
  // higher length floor than the venue/event name-mention match
  // (matchByNameMention, below) since this is matching inside a compact
  // username-style string with no word boundaries to anchor on, where a
  // short name risks a false positive.
  function normalizeForMatch(s: string): string {
    return s.toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  const artistNameFragments = (activeArtists ?? [])
    .map((a) => normalizeForMatch(a.name as string))
    .filter((n) => n.length >= 6);

  const filtered = scanned.filter((c) => {
    if (existingEmails.has(c.email)) return false;
    const domain = c.email.split("@")[1];
    if (domain && excludedDomainSet.has(domain)) return false;
    if (domain && teamDomains.has(domain)) return false;
    const localPart = normalizeForMatch(c.email.split("@")[0] ?? "");
    if (artistNameFragments.some((fragment) => localPart.includes(fragment))) return false;
    return true;
  });

  // 3. Best-guess a company match. First pass: domain, against every
  // company with a website on file (only 245 companies today -- cheap to
  // load in full). Second pass (only when the first found nothing): scan
  // the candidate's subject + body excerpt for a known company's name
  // mention -- catches a venue that's referenced by name but doesn't have
  // (or doesn't match on) a website on file. Separately, always try a name
  // mention against events too, since there's no domain to match an event
  // against at all.
  const [{ data: companiesWithWebsite }, { data: allCompanies }, { data: allEvents }] =
    await Promise.all([
      supabase.from("companies").select("id, name, website").not("website", "is", null),
      supabase.from("companies").select("id, name").eq("archived", false),
      supabase.from("events").select("id, name").eq("archived", false),
    ]);

  const companyByDomain = new Map<string, { id: string; name: string }>();
  for (const company of companiesWithWebsite ?? []) {
    const domain = normalizeWebsiteDomain(company.website as string);
    if (domain && !companyByDomain.has(domain)) {
      companyByDomain.set(domain, { id: company.id as string, name: company.name as string });
    }
  }
  const companyRecords = (allCompanies ?? []) as { id: string; name: string }[];
  const eventRecords = (allEvents ?? []) as { id: string; name: string }[];

  type EnrichedCandidate = ScannedCandidate & {
    matchedCompanyId: string | null;
    inferredCompanyName: string | null;
    inferredCompanyDomain: string | null;
    matchedEventId: string | null;
    inferredEventName: string | null;
  };

  const enriched: EnrichedCandidate[] = filtered.map((c) => {
    const domain = c.email.split("@")[1] ?? null;
    const domainMatch = domain ? companyByDomain.get(domain) : undefined;

    const mentionText = [c.subject, c.bodySnippet].filter(Boolean).join(" ");
    const companyMention = domainMatch ? null : matchByNameMention(mentionText, companyRecords);
    const eventMention = matchByNameMention(mentionText, eventRecords);

    const company = domainMatch ?? companyMention ?? null;

    return {
      ...c,
      matchedCompanyId: company?.id ?? null,
      inferredCompanyName: company?.name ?? null,
      inferredCompanyDomain: domain,
      matchedEventId: eventMention?.id ?? null,
      inferredEventName: eventMention?.name ?? null,
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
          inferred_phone: c.inferredPhone,
          inferred_company_name: c.inferredCompanyName,
          inferred_company_domain: c.inferredCompanyDomain,
          matched_company_id: c.matchedCompanyId,
          matched_event_id: c.matchedEventId,
          inferred_event_name: c.inferredEventName,
          subject: c.subject,
          body_snippet: c.bodySnippet,
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
