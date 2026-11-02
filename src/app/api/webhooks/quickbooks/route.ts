import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getInvoicingProvider, type InvoicingProvider } from "@/lib/invoicing";

// QBO posts here on any change to an Invoice or Payment in the connected
// company -- same "notification in, fetch full state from the provider,
// update the local record" shape as /api/webhooks/signwell, for the same
// reason: the payload itself is thin (entity name/id/operation/timestamp,
// no balance/paid-status), so "is this actually paid now" always means a
// follow-up getInvoice call, never trusting the webhook body alone (see
// docs/operations-accounting-plan.md section 2). No middleware exemption
// needed -- /api/webhooks is already exempted from the login redirect for
// the SignWell webhook, and that covers this path too.
//
// Idempotency: QBO can and will redeliver the same notification. Every
// write below sets a row's fields from the provider's current state
// rather than incrementing/appending (the status columns, that is --
// provider_events stays append-only, same as contract_signatures), so
// redelivery is naturally safe.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const provider = getInvoicingProvider();

  let verified: boolean;
  try {
    verified = provider.verifyWebhookSignature(rawBody, req.headers);
  } catch (err) {
    console.error("QuickBooks webhook: verification error", err);
    return NextResponse.json({ error: "verification failed" }, { status: 500 });
  }
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const events = provider.parseWebhookEvents(rawBody);
  const supabase = createServiceRoleClient();

  // Invoice-entity events resolve directly to one commission_invoices row
  // by provider_invoice_id. Payment-entity events don't carry an invoice
  // id at all -- NEEDS LIVE VERIFICATION: resolving a Payment to the
  // specific invoice(s) it applies to means a further GET /payment/{id}
  // call and reading its Line[].LinkedTxn, untested against a real
  // account. Simpler and still correct at Ridge's actual volume (a
  // handful of outstanding invoices at any time): on *any* Payment event,
  // re-check every invoice this app still considers outstanding ('sent'),
  // rather than only the one the payment was actually for.
  const invoiceIdsToCheck = new Set<string>();
  let sawPaymentEvent = false;

  for (const event of events) {
    if (event.type === "invoice_changed") {
      invoiceIdsToCheck.add(event.entityId);
      await appendProviderEvent(supabase, event.entityId, event.raw);
    } else if (event.type === "payment_received") {
      sawPaymentEvent = true;
    } else {
      console.warn("QuickBooks webhook: unrecognized event", event.raw);
    }
  }

  if (sawPaymentEvent) {
    const { data: outstanding } = await supabase
      .from("commission_invoices")
      .select("provider_invoice_id")
      .eq("status", "sent")
      .not("provider_invoice_id", "is", null);
    for (const row of outstanding ?? []) {
      if (row.provider_invoice_id) invoiceIdsToCheck.add(row.provider_invoice_id);
    }
  }

  for (const providerInvoiceId of invoiceIdsToCheck) {
    await syncInvoiceState(supabase, provider, providerInvoiceId);
  }

  return NextResponse.json({ ok: true });
}

async function appendProviderEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  providerInvoiceId: string,
  raw: unknown
): Promise<void> {
  const { data } = await supabase
    .from("commission_invoices")
    .select("id, provider_events")
    .eq("provider_invoice_id", providerInvoiceId)
    .maybeSingle();
  if (!data) return; // logged as "no matching row" by syncInvoiceState below
  const existing = Array.isArray(data.provider_events) ? data.provider_events : [];
  await supabase
    .from("commission_invoices")
    .update({ provider_events: [...existing, { at: new Date().toISOString(), raw }] })
    .eq("id", data.id);
}

async function syncInvoiceState(
  supabase: ReturnType<typeof createServiceRoleClient>,
  provider: InvoicingProvider,
  providerInvoiceId: string
): Promise<void> {
  const { data: row } = await supabase
    .from("commission_invoices")
    .select("id, play_id, status")
    .eq("provider_invoice_id", providerInvoiceId)
    .maybeSingle();

  if (!row) {
    // Not necessarily an error -- could be an invoice QBO knows about that
    // Base Camp never created (manual QBO entry), or a stale/test-mode id.
    // Log and move on rather than fail the whole webhook over one entry.
    console.warn(`QuickBooks webhook: no commission_invoices row for provider_invoice_id=${providerInvoiceId}`);
    return;
  }

  // Already settled one way or the other -- nothing left to resolve, and
  // never un-void or un-pay a row from a later/redelivered notification.
  if (row.status === "paid" || row.status === "voided") return;

  let state;
  try {
    state = await provider.getInvoice(providerInvoiceId);
  } catch (err) {
    console.error(`QuickBooks webhook: getInvoice failed for ${providerInvoiceId}`, err);
    return;
  }

  if (state.voided) {
    await supabase
      .from("commission_invoices")
      .update({ status: "voided", voided_at: new Date().toISOString() })
      .eq("id", row.id);
    return;
  }

  if (state.paid) {
    await supabase
      .from("commission_invoices")
      .update({
        status: "paid",
        paid_amount: state.totalAmount,
        paid_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    // The one Kanban auto-tie-in this plan makes (section 5/6 of the plan
    // doc): 'settled' fires the moment paid_at is set, nothing else about
    // plays.status changes from this webhook. Guarded to only fire from
    // 'played', same reasoning as advancePlayToConfirmed's guard in the
    // SignWell webhook -- a no-op, not an error, if the play is already
    // somewhere else or this notification is a redelivery after the flip
    // already happened.
    await supabase.from("plays").update({ status: "settled" }).eq("id", row.play_id).eq("status", "played");
  }
}
