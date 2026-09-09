import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { saveSignedContractToPlay } from "@/lib/contractStorage";
import { getSignatureProvider, fetchCompletedDocumentBase64 } from "@/lib/signature";

// SignWell posts here every time something happens on a signature request:
// sent, viewed, one signer completing, everyone completing, or a decline.
// This is the only inbound side of the whole signature integration -- an
// unauthenticated, server-to-server callback -- so every response short of
// "verified and handled" needs to still return a real HTTP status rather
// than throwing, or SignWell will keep retrying indefinitely.
//
// Idempotency: SignWell (like most webhook senders) can and will redeliver
// the same event. Every write below is a plain "set this row's status to
// X" rather than an increment/append-only mutation for the *status*
// columns, so redelivery is naturally safe -- the one exception is
// provider_events, which is an audit log and is allowed to gain duplicate
// entries on a redelivery; that's a cosmetic cost, not a correctness one.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const provider = getSignatureProvider();

  let verified: boolean;
  try {
    verified = provider.verifyWebhookSignature(rawBody, req.headers);
  } catch (err) {
    console.error("Signature webhook: verification error", err);
    return NextResponse.json({ error: "verification failed" }, { status: 500 });
  }
  if (!verified) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const event = provider.parseWebhookEvent(rawBody);
  const supabase = createServiceRoleClient();

  const { data: row } = await supabase
    .from("contract_signatures")
    .select(
      "id, play_id, status, provider_artist_recipient_id, provider_buyer_recipient_id, provider_events"
    )
    .eq("provider_document_id", event.providerDocumentId)
    .maybeSingle();

  if (!row) {
    // Not necessarily an error -- could be a test-mode event from before
    // this row existed, or a stale document id. Log and 200 so it isn't
    // retried forever.
    console.warn(
      `Signature webhook: no contract_signatures row for provider_document_id=${event.providerDocumentId}`
    );
    return NextResponse.json({ ok: true, note: "no matching row" });
  }

  const existingEvents = Array.isArray(row.provider_events) ? row.provider_events : [];
  const updates: Record<string, unknown> = {
    provider_events: [
      ...existingEvents,
      { at: new Date().toISOString(), type: event.type, raw: event.raw },
    ],
  };

  const signerRole: "artist" | "buyer" | null =
    event.recipientId === row.provider_artist_recipient_id
      ? "artist"
      : event.recipientId === row.provider_buyer_recipient_id
        ? "buyer"
        : null;

  switch (event.type) {
    case "viewed":
      if (signerRole === "artist" && row.status !== "completed") {
        updates.artist_signer_status = "viewed";
      } else if (signerRole === "buyer" && row.status !== "completed") {
        updates.buyer_signer_status = "viewed";
      }
      break;

    case "signer_completed":
      if (signerRole === "artist") {
        updates.artist_signer_status = "signed";
        updates.artist_signer_signed_at = new Date().toISOString();
      } else if (signerRole === "buyer") {
        updates.buyer_signer_status = "signed";
        updates.buyer_signer_signed_at = new Date().toISOString();
      }
      if (row.status === "sent") updates.status = "partially_signed";
      break;

    case "completed": {
      updates.status = "completed";
      updates.completed_at = new Date().toISOString();
      updates.artist_signer_status = "signed";
      updates.buyer_signer_status = "signed";
      try {
        const signedBase64 =
          event.signedDocumentBase64 ??
          (await fetchCompletedDocumentBase64(event.providerDocumentId));
        const path = await saveSignedContractToPlay(supabase, row.play_id, signedBase64);
        updates.signed_document_path = path;
      } catch (err) {
        // Don't fail the whole webhook over the document fetch -- the
        // signature status itself is the more important fact to record
        // correctly, and this is fully retriable later (the completed_pdf
        // endpoint doesn't stop working once the document is done).
        console.error("Signature webhook: failed to store signed PDF", err);
      }
      break;
    }

    case "declined":
      updates.status = "declined";
      if (signerRole === "artist") updates.artist_signer_status = "declined";
      if (signerRole === "buyer") updates.buyer_signer_status = "declined";
      break;

    case "sent":
    case "unknown":
      // Nothing beyond the audit-log append above -- 'sent' is already
      // recorded when we create the row, and an unrecognized event type is
      // logged for later inspection rather than acted on.
      if (event.type === "unknown") {
        console.warn("Signature webhook: unrecognized event type", event.raw);
      }
      break;
  }

  const { error } = await supabase.from("contract_signatures").update(updates).eq("id", row.id);
  if (error) {
    console.error("Signature webhook: failed to update contract_signatures", error);
    return NextResponse.json({ error: "database update failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
