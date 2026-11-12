import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getInvoicingProvider } from "@/lib/invoicing";
import { computePlayRevenue } from "@/lib/revenue";
import { logEmailFailure } from "@/lib/approvalEmail";
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
//   Phase 2 -- push every 'draft' row (new ones from phase 1, and any from
//   a prior run that didn't finish) through the provider: createInvoice if
//   it doesn't have a providerInvoiceId yet, then sendInvoice either way --
//   QBO itself emails the actual invoice to the customer (section 2, "QBO
//   owns sending"), and only a successful send sets sent_at/status='sent'.
//   A failure at either step leaves the row exactly as it was (with
//   providerInvoiceId saved if createInvoice got that far) so the next run
//   retries just the piece that didn't finish, rather than risking a
//   duplicate QBO invoice.
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

function formatShowDate(showDate: string | null): string {
  if (!showDate) return "date TBD";
  const parsed = new Date(showDate + "T00:00:00Z");
  return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}/${parsed.getUTCFullYear()}`;
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

type DraftInvoiceRow = {
  id: string;
  play_id: string;
  artist_id: string;
  amount: number;
  provider_invoice_id: string | null;
  provider_customer_id: string | null;
  plays: {
    show_date: string | null;
    venue_name: string | null;
    venue: { name: string | null } | null;
    artists: ArtistRow | null;
  } | null;
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

  // -- Phase 2: push every outstanding draft through the provider. --
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
    const artist = row.plays?.artists;
    if (!artist) continue;

    try {
      // The artist is who Ridge invoices (section 2) -- never the manager,
      // even though a manager contact is often also on file. Per Greg
      // (2026-11-12), the manager (when one's on file) now also rides
      // along as a CC on the send itself, below -- they're on copy, not a
      // second billing party.
      const [{ data: artistContacts }, { data: managerContacts }] = await Promise.all([
        supabase
          .from("contact_artists")
          .select("contacts(full_name, email)")
          .eq("artist_id", artist.id)
          .eq("role", "artist"),
        supabase
          .from("contact_artists")
          .select("contacts(full_name, email)")
          .eq("artist_id", artist.id)
          .eq("role", "manager"),
      ]);
      const billingContact = (artistContacts ?? [])
        .map((r) => r.contacts as unknown as { full_name: string; email: string | null } | null)
        .find((c): c is { full_name: string; email: string } => !!c?.email);
      // Optional and best-effort -- no manager on file just means no CC,
      // never a reason to block the artist's own invoice. Every
      // role='manager' contact with an email is included, joined into one
      // comma-separated string -- QBO's Cc field (same as its own "Send"
      // dialog in the UI) takes a single address field that accepts
      // multiple comma-separated recipients, and some artists (e.g. Cody
      // Webb) have more than one management contact on file.
      const managerEmails = (managerContacts ?? [])
        .map((r) => r.contacts as unknown as { full_name: string; email: string | null } | null)
        .filter((c): c is { full_name: string; email: string } => !!c?.email)
        .map((c) => c.email);
      const managerCcEmail = managerEmails.length > 0 ? managerEmails.join(",") : null;

      if (!billingContact) {
        blocked += 1;
        await logEmailFailure(
          "commission_invoice_blocked",
          artist.name,
          { playId: row.play_id, artistId: artist.id, reason: "no artist contact email on file" },
          `Can't invoice ${artist.name} for the ${formatShowDate(row.plays?.show_date ?? null)} play -- ` +
            `no artist contact with an email is on file. Add one on the artist's profile; this will pick ` +
            `it up on tomorrow's run.`
        );
        continue;
      }

      let providerInvoiceId = row.provider_invoice_id;
      let providerCustomerId = row.provider_customer_id;

      if (!providerInvoiceId) {
        const venueLabel = row.plays?.venue?.name ?? row.plays?.venue_name ?? "venue TBD";
        const result = await provider.createInvoice({
          existingProviderCustomerId: artist.qbo_customer_id,
          customer: {
            name: artist.legal_entity_name ?? artist.name,
            email: billingContact.email,
          },
          ccEmail: managerCcEmail,
          description: `Booking commission -- ${artist.name} at ${venueLabel}, ${formatShowDate(row.plays?.show_date ?? null)}`,
          amount: row.amount,
        });
        providerInvoiceId = result.providerInvoiceId;
        providerCustomerId = result.providerCustomerId;

        await supabase
          .from("commission_invoices")
          .update({ provider_invoice_id: providerInvoiceId, provider_customer_id: providerCustomerId })
          .eq("id", row.id);

        if (!artist.qbo_customer_id) {
          await supabase.from("artists").update({ qbo_customer_id: providerCustomerId }).eq("id", artist.id);
        }
        created += 1;
      }

      await provider.sendInvoice(providerInvoiceId, billingContact.email);
      await supabase
        .from("commission_invoices")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", row.id);
      sent += 1;
    } catch (err) {
      blocked += 1;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`create-commission-invoices: failed for commission_invoices row ${row.id}`, err);
      await logEmailFailure(
        "commission_invoice_blocked",
        artist.name,
        { playId: row.play_id, artistId: artist.id, commissionInvoiceId: row.id },
        `QuickBooks invoice creation/send failed for ${artist.name}'s ${formatShowDate(row.plays?.show_date ?? null)} play: ${message}`
      );
    }
  }

  return NextResponse.json({ ok: true, drafted, notApplicable, missingRate, created, sent, blocked });
}
