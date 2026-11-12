"use server";

// The review gate (2026-11-12, per Greg -- docs/operations-accounting-plan.md
// section 9). Everything here is admin-only, same gate as the rest of the
// Revenue page (requireAdmin() below, called by every exported function
// the way every other admin action in this app already does it -- never
// relying on the UI alone to hide this).
//
// getPendingCommissionInvoiceApprovals() feeds the review card on the
// Revenue page: every commission_invoices row that's drafted but not yet
// approved. approveAndSendCommissionInvoice() is what "Approve & send"
// actually calls -- sets approved_at, then runs the exact same
// create/send logic the daily cron's Phase 2 does (pushCommissionInvoiceRow,
// shared rather than duplicated), so the invoice goes out immediately
// instead of waiting for tomorrow's 9:30am run. approveAndSendAllCommissionInvoices()
// is the bulk version behind "Approve & send all," one row at a time
// through the same function -- no separate bulk code path to drift from
// the single-row one.

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { getInvoicingProvider } from "@/lib/invoicing";
import { pushCommissionInvoiceRow, type DraftInvoiceRow } from "@/lib/invoicing/pushCommissionInvoice";
import { listTeamMembers } from "./userProfiles";

export type PendingCommissionInvoiceRow = {
  id: string;
  artistId: string;
  artistName: string;
  artistPhotoUrl: string | null;
  amount: number;
  showDate: string | null;
  venueLabel: string;
  // Who booked it -- per Greg (2026-11-12), higher-priority info here
  // than the commission math (the rate's fixed and every row here is a
  // booking commission by definition -- management-commission invoicing
  // isn't built yet, see docs/operations-accounting-plan.md section 8).
  agentName: string | null;
  // When the settlement/show-report data actually came in. Always set
  // for a row that reached this list at all (settlement_submitted_at is
  // what makes a play eligible to draft in the first place -- see the
  // cron's Phase 1), so this is a freshness check, not a live gate.
  settlementSubmittedAt: string | null;
  billingEmail: string | null;
  // Not a literal CC anymore (see pushCommissionInvoice.ts's 2026-11-12
  // note -- QBO's Invoice API rejected BillEmailCc outright on the first
  // live attempt) -- this is how many management contacts will get a
  // separate Base-Camp-sent notice once the real invoice goes out.
  managerNoticeCount: number;
};

type PendingQueryRow = {
  id: string;
  artist_id: string;
  amount: number;
  plays: {
    show_date: string | null;
    venue_name: string | null;
    booking_agent_user_id: string | null;
    settlement_submitted_at: string | null;
    venue: { name: string | null } | null;
    artists: { id: string; name: string; photo_url: string | null } | null;
  } | null;
};

export async function getPendingCommissionInvoiceApprovals(): Promise<PendingCommissionInvoiceRow[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data } = await supabase
    .from("commission_invoices")
    .select(
      `id, artist_id, amount,
       plays(show_date, venue_name, booking_agent_user_id, settlement_submitted_at,
         venue:companies!plays_venue_id_fkey(name),
         artists(id, name, photo_url))`
    )
    .eq("kind", "booking")
    .eq("status", "draft")
    .is("approved_at", null)
    .returns<PendingQueryRow[]>();

  const rows = (data ?? []).filter((r) => r.plays?.artists);
  if (rows.length === 0) return [];

  const artistIds = Array.from(new Set(rows.map((r) => r.artist_id)));
  const [{ data: artistContacts }, teamMembers] = await Promise.all([
    supabase
      .from("contact_artists")
      .select("artist_id, role, contacts(email)")
      .in("artist_id", artistIds)
      .in("role", ["artist", "manager"]),
    listTeamMembers(),
  ]);
  const agentById = new Map(teamMembers.map((m) => [m.id, m]));

  // One billing email per artist (the first role='artist' contact with
  // one on file -- same resolution pushCommissionInvoiceRow itself uses),
  // and a count (not the full list, kept out of this summary view) of
  // role='manager' contacts with an email, who'll ride as CC.
  const billingEmailByArtist = new Map<string, string>();
  const ccCountByArtist = new Map<string, number>();
  for (const row of artistContacts ?? []) {
    const email = (row.contacts as unknown as { email: string | null } | null)?.email;
    if (!email) continue;
    if (row.role === "artist") {
      if (!billingEmailByArtist.has(row.artist_id)) billingEmailByArtist.set(row.artist_id, email);
    } else if (row.role === "manager") {
      ccCountByArtist.set(row.artist_id, (ccCountByArtist.get(row.artist_id) ?? 0) + 1);
    }
  }

  return rows
    .map((r) => {
      const artist = r.plays!.artists!;
      const agentId = r.plays?.booking_agent_user_id ?? null;
      const agent = agentId ? agentById.get(agentId) : null;
      return {
        id: r.id,
        artistId: artist.id,
        artistName: artist.name,
        artistPhotoUrl: artist.photo_url,
        amount: r.amount,
        showDate: r.plays?.show_date ?? null,
        venueLabel: r.plays?.venue?.name ?? r.plays?.venue_name ?? "venue TBD",
        agentName: agent ? (agent.displayName ?? agent.email) : null,
        settlementSubmittedAt: r.plays?.settlement_submitted_at ?? null,
        billingEmail: billingEmailByArtist.get(r.artist_id) ?? null,
        managerNoticeCount: ccCountByArtist.get(r.artist_id) ?? 0,
      };
    })
    .sort((a, b) => (a.showDate ?? "").localeCompare(b.showDate ?? ""));
}

export type ApproveResult = { ok: true; created: boolean } | { ok: false; error: string };

async function fetchDraftRowForPush(
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string
): Promise<DraftInvoiceRow | null> {
  const { data } = await supabase
    .from("commission_invoices")
    .select(
      `id, play_id, artist_id, amount, provider_invoice_id, provider_customer_id,
       plays(show_date, venue_name, venue:companies!plays_venue_id_fkey(name),
         artists(id, name, legal_entity_name, ridge_books, ridge_manages,
           booking_agent_commission_pct, management_commission_pct, qbo_customer_id))`
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as DraftInvoiceRow) ?? null;
}

// The one real action behind "Approve & send." Sets approved_at first
// (so a crash mid-send still leaves a trail that this was a deliberate,
// reviewed approval, not an accident) and then runs the exact same push
// logic the cron uses -- same reasoning as sendContractToBuyer regenerating
// before it sends: whatever actually goes out should come from one code
// path, not a UI-only approximation of it.
export async function approveAndSendCommissionInvoice(id: string): Promise<ApproveResult> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("commission_invoices")
    .select("status, approved_at")
    .eq("id", id)
    .maybeSingle();
  if (!existing || existing.status !== "draft") {
    return {
      ok: false,
      error: "This invoice isn't in a draft state anymore -- refresh the page to see its current status.",
    };
  }
  if (existing.approved_at) {
    return { ok: false, error: "Already approved -- refresh the page to see its current status." };
  }

  const { error: approveError } = await supabase
    .from("commission_invoices")
    .update({ approved_at: new Date().toISOString() })
    .eq("id", id);
  if (approveError) return { ok: false, error: approveError.message };

  const row = await fetchDraftRowForPush(supabase, id);
  if (!row || !row.plays?.artists) {
    return { ok: false, error: "Couldn't reload this invoice's play/artist data after approving it." };
  }

  const provider = getInvoicingProvider();
  const result = await pushCommissionInvoiceRow(supabase, provider, row);
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, created: result.created };
}

export type ApproveAllResult = { approved: number; sent: number; blocked: number; errors: string[] };

// "Approve & send all" -- one confirmation instead of one per row, but
// each row still goes through approveAndSendCommissionInvoice individually
// (no separate bulk code path), so a failure on one row never stops the
// rest, same "never let one bad row stall everything else" reasoning as
// the cron's own per-row try/catch.
export async function approveAndSendAllCommissionInvoices(): Promise<ApproveAllResult> {
  await requireAdmin();
  const pending = await getPendingCommissionInvoiceApprovals();

  let sent = 0;
  let blocked = 0;
  const errors: string[] = [];
  for (const row of pending) {
    const result = await approveAndSendCommissionInvoice(row.id);
    if (result.ok) {
      sent += 1;
    } else {
      blocked += 1;
      errors.push(`${row.artistName} (${row.showDate ?? "undated"}): ${result.error}`);
    }
  }
  return { approved: pending.length, sent, blocked, errors };
}
