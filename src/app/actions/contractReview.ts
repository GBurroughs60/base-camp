"use server";

import { createClient } from "@/lib/supabase/server";
import { saveContractToPlay } from "@/lib/contractStorage";
import { generateContractForPlay } from "./contract";
import { fetchContractContext, buildContractMergeData } from "@/lib/contractData";
import { CONTRACT_TBD } from "@/lib/generateContract";
import { getSignatureProvider } from "@/lib/signature";

type ActionResult = { ok: true } | { ok: false; error: string };

type GeneratedContract = { fileName: string; base64: string };

// Regenerates from current data and saves onto the play's Contract File
// slot. The only way anything on a generated contract gets fixed is by
// correcting the underlying field and regenerating -- there's no document
// editor -- so this is what every action below does before anything else,
// guaranteeing the saved file (and whatever gets sent for signature) always
// reflects the latest edit rather than whatever was on file earlier.
async function regenerateAndSave(
  playId: string
): Promise<{ ok: true; contract: GeneratedContract } | { ok: false; error: string }> {
  const contract = await generateContractForPlay(playId);
  if (!contract.ok) return { ok: false, error: contract.error };

  const supabase = await createClient();
  try {
    await saveContractToPlay(supabase, playId, contract.fileName, contract.base64);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the contract file.",
    };
  }
  return { ok: true, contract: { fileName: contract.fileName, base64: contract.base64 } };
}

// Used on the Contract Review screen any time -- before anything's been
// generated yet, or after fixing a field -- to refresh the saved copy
// without also sending anything.
export async function regenerateContract(playId: string): Promise<ActionResult> {
  const result = await regenerateAndSave(playId);
  if (!result.ok) return result;
  return { ok: true };
}

async function appendSignatureEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  signatureId: string,
  event: Record<string, unknown>
): Promise<void> {
  // provider_events is append-only audit history -- read-modify-write is
  // fine here since sends/voids/webhooks for one play's signature request
  // happen one at a time in practice, not genuinely concurrently.
  const { data } = await supabase
    .from("contract_signatures")
    .select("provider_events")
    .eq("id", signatureId)
    .maybeSingle();
  const existing = Array.isArray(data?.provider_events) ? data.provider_events : [];
  await supabase
    .from("contract_signatures")
    .update({ provider_events: [...existing, { at: new Date().toISOString(), ...event }] })
    .eq("id", signatureId);
}

export type ContractReadiness =
  | { ready: true }
  | { ready: false; reasons: string[] };

// Everything that has to be true before a contract can go out for real
// signatures. Checked both so the review screen can show what's missing
// *before* the agent even tries to send, and inside sendForSignature itself
// as the actual gate -- never rely on the UI alone to enforce this.
export async function checkContractReadiness(playId: string): Promise<ContractReadiness> {
  const result = await fetchContractContext(playId);
  if (!result.ok) return { ready: false, reasons: [result.error] };

  const { context } = result;
  const merged = buildContractMergeData(context);
  const reasons: string[] = [];

  const missingFields = Object.entries(merged)
    .filter(([, value]) => value === CONTRACT_TBD)
    .map(([key]) => key);
  if (missingFields.length > 0) {
    reasons.push(
      `${missingFields.length} field${missingFields.length === 1 ? "" : "s"} on this contract still need${missingFields.length === 1 ? "s" : ""} to be filled in before it can be sent: ${missingFields.join(", ")}.`
    );
  }

  if (!context.signatory?.email?.trim()) {
    reasons.push(
      "The artist has no signatory (or the signatory has no email) on file -- set one on the artist's profile."
    );
  }
  if (!context.purchaserContact?.email?.trim()) {
    reasons.push(
      "There's no buyer contact email on file for this play -- add one on the play's Contact card."
    );
  }

  return reasons.length > 0 ? { ready: false, reasons } : { ready: true };
}

type SignatureRow = {
  id: string;
  status: string;
  artist_signer_status: string;
  buyer_signer_status: string;
  sent_at: string;
};

export async function getContractSignature(playId: string): Promise<SignatureRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("contract_signatures")
    .select("id, status, artist_signer_status, buyer_signer_status, sent_at")
    .eq("play_id", playId)
    .maybeSingle();
  return data ?? null;
}

// The agent's confirmation that they've reviewed the contract and it's
// ready to go out for real signatures from both the artist rep and the
// buyer. This is the one action in the whole contract flow with real,
// hard-to-reverse consequences -- an actual signature request landing in
// someone's inbox -- so every guardrail below is a deliberate block, not
// just a UI nicety:
//
//  - Never resend while a request is already outstanding (sent or
//    partially signed) -- that would put two live signature requests for
//    the same play in front of the buyer. Void the old one first.
//  - Never send while any contract field is still a visible
//    [TO BE FILLED IN BEFORE SENDING] placeholder, or either signer is
//    missing an email -- see checkContractReadiness.
//  - Always regenerate immediately before sending, so what actually goes
//    out reflects the latest edit, never a stale save.
export async function sendContractToBuyer(playId: string): Promise<ActionResult> {
  const supabase = await createClient();

  const existing = await getContractSignature(playId);
  if (existing && (existing.status === "sent" || existing.status === "partially_signed")) {
    return {
      ok: false,
      error:
        "A signature request is already outstanding for this contract. Void it from this screen before sending a new one.",
    };
  }

  const readiness = await checkContractReadiness(playId);
  if (!readiness.ready) {
    return { ok: false, error: readiness.reasons.join(" ") };
  }

  const saved = await regenerateAndSave(playId);
  if (!saved.ok) return saved;

  const contextResult = await fetchContractContext(playId);
  if (!contextResult.ok) return { ok: false, error: contextResult.error };
  const { artist, signatory, purchaserContact, purchaserCompanyName } = contextResult.context;

  // Guaranteed non-null by checkContractReadiness above.
  const artistName = signatory!.full_name;
  const artistEmail = signatory!.email!;
  const buyerName = purchaserCompanyName ?? purchaserContact!.full_name;
  const buyerEmail = purchaserContact!.email!;

  // Defaults to SignWell's non-binding test mode unless explicitly turned
  // off -- nothing sent through this flow is a real signature request
  // until SIGNWELL_TEST_MODE is deliberately set to "false" in the
  // environment. This is the single switch that takes Base Camp from
  // testing to actually sending live contracts.
  const testMode = process.env.SIGNWELL_TEST_MODE !== "false";

  const provider = getSignatureProvider();
  let sendResult;
  try {
    sendResult = await provider.sendForSignature({
      fileBase64: saved.contract.base64,
      fileName: saved.contract.fileName,
      documentTitle: `${artist.name} Performance Agreement`,
      signers: [
        { role: "artist", name: artistName, email: artistEmail },
        { role: "buyer", name: buyerName, email: buyerEmail },
      ],
      testMode,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't send the contract for signature.",
    };
  }

  const { error } = await supabase.from("contract_signatures").upsert(
    {
      play_id: playId,
      provider: provider.name,
      provider_document_id: sendResult.providerDocumentId,
      provider_artist_recipient_id: sendResult.recipientIdByRole.artist,
      provider_buyer_recipient_id: sendResult.recipientIdByRole.buyer,
      status: "sent",
      artist_signer_status: "pending",
      artist_signer_signed_at: null,
      buyer_signer_status: "pending",
      buyer_signer_signed_at: null,
      signed_document_path: null,
      sent_at: new Date().toISOString(),
      completed_at: null,
      voided_at: null,
    },
    { onConflict: "play_id" }
  );
  if (error) return { ok: false, error: error.message };

  const row = await getContractSignature(playId);
  if (row) {
    await appendSignatureEvent(supabase, row.id, {
      type: "sent",
      test_mode: testMode,
      provider_document_id: sendResult.providerDocumentId,
    });
  }

  return { ok: true };
}

// Cancels an outstanding (not yet fully signed) request -- for a mistake
// caught after sending, or simply changing your mind. Deliberately refuses
// to touch a completed request: a signed contract doesn't get silently
// voided from this screen.
export async function voidContractSignature(playId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const existing = await getContractSignature(playId);
  if (!existing) return { ok: false, error: "No signature request found for this play." };
  if (existing.status !== "sent" && existing.status !== "partially_signed") {
    return {
      ok: false,
      error: `Can't void a request that's already ${existing.status}.`,
    };
  }

  const provider = getSignatureProvider();
  try {
    const { data } = await supabase
      .from("contract_signatures")
      .select("provider_document_id")
      .eq("id", existing.id)
      .maybeSingle();
    if (data?.provider_document_id) {
      await provider.voidRequest(data.provider_document_id);
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't void the signature request.",
    };
  }

  const { error } = await supabase
    .from("contract_signatures")
    .update({ status: "voided", voided_at: new Date().toISOString() })
    .eq("id", existing.id);
  if (error) return { ok: false, error: error.message };

  await appendSignatureEvent(supabase, existing.id, { type: "voided" });
  return { ok: true };
}
