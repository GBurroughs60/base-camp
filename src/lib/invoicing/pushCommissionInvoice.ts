import type { SupabaseClient } from "@supabase/supabase-js";
import type { InvoicingProvider } from "./types";
import { logEmailFailure, sendCommissionInvoiceManagerNotice } from "@/lib/approvalEmail";

// Pulled out of api/cron/create-commission-invoices/route.ts (2026-11-12)
// so the exact same "actually talk to QuickBooks" logic has only one
// home, called from two places: the daily cron's Phase 2 (for rows a
// human already approved on a prior visit to the review gate, in case a
// previous attempt only got partway through), and the new "Approve &
// send" server action (src/app/actions/commissionInvoices.ts), which
// wants this to run immediately rather than waiting for tomorrow's
// 9:30am run. Neither caller duplicates this -- the review-gate decision
// (docs/operations-accounting-plan.md section 9) was specifically about
// not letting an unreviewed amount reach QuickBooks at all, not about
// the mechanics of the push itself, which don't change.

export function formatShowDate(showDate: string | null): string {
  if (!showDate) return "date TBD";
  const parsed = new Date(showDate + "T00:00:00Z");
  return `${parsed.getUTCMonth() + 1}/${parsed.getUTCDate()}/${parsed.getUTCFullYear()}`;
}

export type ArtistRow = {
  id: string;
  name: string;
  legal_entity_name: string | null;
  ridge_books: boolean;
  ridge_manages: boolean;
  booking_agent_commission_pct: number | null;
  management_commission_pct: number | null;
  qbo_customer_id: string | null;
};

export type DraftInvoiceRow = {
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

export type PushResult =
  | { ok: true; created: boolean }
  | { ok: false; reason: "no_billing_contact" | "provider_error"; error: string };

// One `commission_invoices` row, start to finish: resolve contacts,
// create the QBO invoice if it doesn't have one yet, send it, and update
// the row's own status. Never throws -- every failure path returns
// { ok: false } after already logging/alerting, so a caller looping over
// several rows (the cron) never needs its own try/catch per row, and a
// caller handling just one (the server action) gets a result object it
// can show directly in the UI instead of re-deriving one from a thrown
// error.
export async function pushCommissionInvoiceRow(
  supabase: SupabaseClient,
  provider: InvoicingProvider,
  row: DraftInvoiceRow
): Promise<PushResult> {
  const artist = row.plays?.artists;
  if (!artist) {
    return { ok: false, reason: "provider_error", error: "Play/artist data missing on this row." };
  }

  try {
    // The artist is who Ridge invoices (section 2) -- never the manager,
    // even though a manager contact is often also on file. Per Greg
    // (2026-11-12), the manager (when one's on file) now also gets
    // notified once the send succeeds, below -- informed, not a second
    // billing party (and not a literal CC on the QBO invoice itself --
    // see sendCommissionInvoiceManagerNotice's own comment for why).
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
    // Optional and best-effort -- no manager on file just means no notice
    // goes out, never a reason to block the artist's own invoice. Every
    // role='manager' contact with an email is included -- some artists
    // (e.g. Cody Webb) have more than one. Not a literal CC on the QBO
    // invoice anymore (see the note on sendCommissionInvoiceManagerNotice
    // below) -- just the list of who gets Base Camp's own separate notice
    // once the real invoice send succeeds.
    const managerEmails = (managerContacts ?? [])
      .map((r) => r.contacts as unknown as { full_name: string; email: string | null } | null)
      .filter((c): c is { full_name: string; email: string } => !!c?.email)
      .map((c) => c.email);

    if (!billingContact) {
      const noContactError = "No artist contact with an email is on file -- add one on the artist's profile.";
      await supabase.from("commission_invoices").update({ last_error: noContactError }).eq("id", row.id);
      await logEmailFailure(
        "commission_invoice_blocked",
        artist.name,
        { playId: row.play_id, artistId: artist.id, reason: "no artist contact email on file" },
        `Can't invoice ${artist.name} for the ${formatShowDate(row.plays?.show_date ?? null)} play -- ` +
          `no artist contact with an email is on file. Add one on the artist's profile; this will pick ` +
          `it up on tomorrow's run.`
      );
      return { ok: false, reason: "no_billing_contact", error: noContactError };
    }

    let providerInvoiceId = row.provider_invoice_id;
    let providerCustomerId = row.provider_customer_id;
    let created = false;

    if (!providerInvoiceId) {
      const venueLabel = row.plays?.venue?.name ?? row.plays?.venue_name ?? "venue TBD";
      const result = await provider.createInvoice({
        existingProviderCustomerId: artist.qbo_customer_id,
        customer: {
          name: artist.legal_entity_name ?? artist.name,
          email: billingContact.email,
        },
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
      created = true;
    }

    await provider.sendInvoice(providerInvoiceId, billingContact.email);
    await supabase
      .from("commission_invoices")
      // last_error cleared on a successful send -- it should only ever
      // describe the *most recent* attempt, never linger after a retry
      // fixes things.
      .update({ status: "sent", sent_at: new Date().toISOString(), last_error: null })
      .eq("id", row.id);

    // Best-effort, after the fact -- the artist's invoice already went
    // out successfully above, which is the thing that actually matters;
    // a failure notifying management (logged via logEmailFailure inside
    // sendCommissionInvoiceManagerNotice itself) never unwinds or retries
    // the invoice send, same "don't let a secondary notice jeopardize the
    // primary obligation" reasoning as everywhere else in this file.
    if (managerEmails.length > 0) {
      await sendCommissionInvoiceManagerNotice({
        managerEmails,
        artistName: artist.name,
        venueLabel: row.plays?.venue?.name ?? row.plays?.venue_name ?? "venue TBD",
        showDate: row.plays?.show_date ?? null,
        amount: row.amount,
        billingEmail: billingContact.email,
      });
    }

    return { ok: true, created };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`pushCommissionInvoiceRow: failed for commission_invoices row ${row.id}`, err);
    // Stored on the row itself (not just the commission_invoice_blocked
    // alert below) so a failed-after-approval row shows its actual reason
    // right on the review card -- see
    // PendingCommissionInvoiceRow.needsRetry/lastError in
    // app/actions/commissionInvoices.ts for why that matters (2026-11-12:
    // this is exactly what Cody Webb's first live BillEmailCc failure
    // surfaced -- a row that was approved, still draft, and otherwise
    // invisible).
    await supabase.from("commission_invoices").update({ last_error: message }).eq("id", row.id);
    await logEmailFailure(
      "commission_invoice_blocked",
      artist.name,
      { playId: row.play_id, artistId: artist.id, commissionInvoiceId: row.id },
      `QuickBooks invoice creation/send failed for ${artist.name}'s ${formatShowDate(row.plays?.show_date ?? null)} play: ${message}`
    );
    return { ok: false, reason: "provider_error", error: message };
  }
}
