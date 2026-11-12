import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getInvoicingProvider } from "@/lib/invoicing";
import { computePlayRevenue } from "@/lib/revenue";
import {
  pushCommissionInvoiceRow,
  type DraftInvoiceRow,
} from "@/lib/invoicing/pushCommissionInvoice";
import type { PlayStatus } from "@/lib/playStatus";

// Daily job that turns settled plays into real QuickBooks invoices --
// docs/operations-accounting-plan.md section 6's "still not built" piece.
// Two phases, deliberately split so a crash between "create the invoice at
// QBO" and "save its id locally" never loses track of a real charge:
//
//   Phase 1 -- decide WHICH plays deserve an invoice, and freeze the amount.
//   For every 'played' play with settlement data in and no commission_invoices
//   row yet (kind='booking'), compute the real commission off the actual
//   post-show numbers (same computePlayRevenue the Revenue/Agent-Commissions
//   pages already use -- no second commission calculator) and insert a
//   'draft' row. Only plays Ridge actually books, and only when a booking
//   commission rate is actually known, get a row at all -- per Greg, never
//   invoice an unknown amount (section 2). A play that's missing a rate
//   simply gets no row yet; it's picked up automatically once one's set,
//   since this phase re-evaluates from scratch every run. amount is
//   captured once, here, not re-read live later (mirrors
//   action_items.occurrence_date's same reasoning).
//
//   Phase 2 -- push every 'draft' row that's also been *approved*
//   (approved_at set -- new ones from phase 1 never qualify on their own;
//   see the review gate below) through the provider: createInvoice if it
//   doesn't have a providerInvoiceId yet, then sendInvoice either way --
//   QBO itself emails the actual invoice to the customer (section 2, "QBO
//   owns sending"), and only a successful send sets sent_at/status='sent'.
//   A failure at either step leaves the row exactly as it was (with
//   providerInvoiceId saved if createInvoice got that far) so the next run
//   retries just the piece that didn't finish, rather than risking a
//   duplicate QBO invoice. The actual push (contact resolution, the
//   createInvoice/sendInvoice calls, the status update, the failure alert)
//   lives in pushCommissionInvoiceRow (lib/invoicing/pushCommissionInvoice.ts)
//   -- shared with the "Approve & send" server action below, since this
//   phase is also what that action calls to fire a row immediately rather
//   than waiting for tomorrow's run.
//
// Review gate (2026-11-12, per Greg -- docs/operations-accounting-plan.md
// section 9): the exact kind of mistake this cron could ship unreviewed is
// the one that already happened once (the Walkout-basis formula bug) --
// a silent wrong amount, with nobody looking before QBO emailed it. So
// Phase 2 here is deliberately passive: it only picks up rows a human
// already approved on the Revenue page's review card (approved_at set),
// which in practice means this phase mostly just retries anything that
// was approved but didn't fully go through last time -- a human visiting
// that card and clicking "Approve & send" is what actually triggers a
// *new* send, immediately, not this cron.
//
// Triggered by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=` query
// param is also accepted for manual/local testing, same as every other
// cron route in this app.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

type ArtistRow = {
  id: string;
  name: string;
  legal_entity_name: string | null;
  ridge_books: boolean;
  ridge_manages: boolean;
  booking_agent_commission_pct: number | null;
  management_commission_pct: number | null;
  qbo_customer_id: string | null;
};

type CandidatePlayRow = {
  id: string;
  status: PlayStatus;
  show_date: string | null;
  guarantee_amount: number | null;
  walkout_amount: number | null;
  gross_merch_sales: number | null;
  booking_agent_commission_pct: number | null;
  artist_id: string | null;
  venue_name: string | null;
  artists: ArtistRow | null;
  venue: { name: string | null } | null;
};

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const provider = getInvoicingProvider();

  // -- Phase 1: find newly-eligible plays and freeze a draft row for each. --
  const { data: candidates, error: candidatesError } = await supabase
    .from("plays")
    .select(
      `id, status, show_date, guarantee_amount, walkout_amount, gross_merch_sales,
       booking_agent_commission_pct, artist_id, venue_name,
       artists(id, name, legal_entity_name, ridge_books, ridge_manages,
         booking_agent_commission_pct, management_commission_pct, qbo_customer_id),
       venue:companies!plays_venue_id_fkey(name)`
    )
    .eq("status", "played")
    .not("settlement_submitted_at", "is", null)
    .returns<CandidatePlayRow[]>();

  if (candidatesError) {
    console.error("create-commission-invoices: candidate query failed", candidatesError);
    return NextResponse.json({ ok: false, error: "candidate query failed" }, { status: 500 });
  }

  const playIds = (candidates ?? []).map((p) => p.id);
  const { data: existingInvoices } = playIds.length
    ? await supabase.from("commission_invoices").select("play_id").eq("kind", "booking").in("play_id", playIds)
    : { data: [] as { play_id: string }[] };
  const alreadyInvoiced = new Set((existingInvoices ?? []).map((r) => r.play_id));

  let drafted = 0;
  let notApplicable = 0;
  let missingRate = 0;

  for (const play of candidates ?? []) {
    if (alreadyInvoiced.has(play.id)) continue;
    const artist = play.artists;
    if (!artist) continue;

    // Ridge doesn't book this artist -- no booking commission ever applies,
    // so there's nothing to invoice. Not an error, re-checked every run at
    // negligible cost (a handful of plays) rather than adding a column just
    // to remember "not applicable" forever.
    if (!artist.ridge_books) {
      notApplicable += 1;
      continue;
    }

    const pct = play.booking_agent_commission_pct ?? artist.booking_agent_commission_pct;
    if (pct == null) {
      // Never invoice an unknown amount (Greg, 2026-10-17). Already flagged
      // passively on the Revenue and Agent Commissions pages' "rate not
      // set" indicators -- no extra alert here, just picked up
      // automatically the moment someone sets the rate.
      missingRate += 1;
      console.warn(
        `create-commission-invoices: play ${play.id} (${artist.name}) has settlement data but no booking commission rate set -- skipping.`
      );
      continue;
    }

    const result = computePlayRevenue(
      {
        id: play.id,
        artistId: artist.id,
        status: play.status,
        guaranteeAmount: play.guarantee_amount,
        grossMerchSales: play.gross_merch_sales,
        walkoutAmount: play.walkout_amount,
        managementCommissionPctOverride: null,
        bookingAgentCommissionPctOverride: play.booking_agent_commission_pct,
      },
      {
        id: artist.id,
        ridgeManages: artist.ridge_manages,
        ridgeBooks: artist.ridge_books,
        managementCommissionPct: artist.management_commission_pct,
        bookingAgentCommissionPct: artist.booking_agent_commission_pct,
      }
    );
    if (result.bookingCommission == null) continue; // shouldn't happen -- pct was just resolved above

    const { error: insertError } = await supabase.from("commission_invoices").insert({
      play_id: play.id,
      artist_id: artist.id,
      kind: "booking",
      amount: result.bookingCommission,
      provider: provider.name,
      status: "draft",
    });
    if (insertError) {
      console.error(`create-commission-invoices: failed to draft invoice row for play ${play.id}`, insertError);
      continue;
    }
    drafted += 1;
  }

  // -- Phase 2: push every draft that's already been approved. A draft
  // still waiting on a human (approved_at null) is deliberately left
  // alone here -- see the review-gate comment above. --
  const { data: draftRows, error: draftsError } = await supabase
    .from("commission_invoices")
    .select(
      `id, play_id, artist_id, amount, provider_invoice_id, provider_customer_id,
       plays(show_date, venue_name, venue:companies!plays_venue_id_fkey(name),
         artists(id, name, legal_entity_name, ridge_books, ridge_manages,
           booking_agent_commission_pct, management_commission_pct, qbo_customer_id))`
    )
    .eq("kind", "booking")
    .eq("status", "draft")
    .not("approved_at", "is", null)
    .returns<DraftInvoiceRow[]>();

  if (draftsError) {
    console.error("create-commission-invoices: draft-row query failed", draftsError);
    return NextResponse.json(
      { ok: false, drafted, notApplicable, missingRate, error: "draft-row query failed" },
      { status: 500 }
    );
  }

  let created = 0;
  let sent = 0;
  let blocked = 0;

  for (const row of draftRows ?? []) {
    if (!row.plays?.artists) continue;
    const result = await pushCommissionInvoiceRow(supabase, provider, row);
    if (result.ok) {
      sent += 1;
      if (result.created) created += 1;
    } else {
      blocked += 1;
    }
  }

  return NextResponse.json({ ok: true, drafted, notApplicable, missingRate, created, sent, blocked });
}
