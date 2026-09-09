"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApprovalResponseEmail } from "@/lib/approvalEmail";
import { generateContractForPlay } from "./contract";

const CONTRACT_BUCKET = "play-contracts";

// Saves the just-generated contract into the play's own Contract File slot
// -- the same bucket/columns ContractUpload.tsx uses for a manually
// uploaded contract -- so the copy that goes out at approval is visible
// and re-downloadable inside Base Camp, not just sitting in an email.
// Requires SUPABASE_SERVICE_ROLE_KEY: this runs from the public, anon-role
// approval flow, and the play-contracts bucket's RLS policies only allow
// authenticated (staff) reads/writes, same as every other table this flow
// touches through a privileged path rather than opening RLS to anon.
//
// Keeps exactly one contract on file per play, matching the single-file
// model ContractUpload already uses: whatever was there before (manually
// uploaded or from an earlier approval cycle) is removed once the new one
// is safely uploaded, rather than letting copies pile up.
//
// Best-effort and isolated on purpose -- see the try/catch at the call
// site. A missing key or a storage hiccup should never block the
// approval-response email, which already carries the contract as an
// attachment regardless of whether this save succeeds.
async function saveContractToPlay(
  playId: string,
  fileName: string,
  base64: string
): Promise<void> {
  const admin = createAdminClient();
  if (!admin) {
    console.warn(
      "SUPABASE_SERVICE_ROLE_KEY is not set -- skipping saving the generated contract to the play's Contract File (the approval email attachment still went out)."
    );
    return;
  }

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${playId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(base64, "base64");

  const { error: uploadError } = await admin.storage
    .from(CONTRACT_BUCKET)
    .upload(path, bytes, {
      contentType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const { data: existing } = await admin.storage.from(CONTRACT_BUCKET).list(playId);
  const stale = (existing ?? [])
    .map((f) => `${playId}/${f.name}`)
    .filter((p) => p !== path);
  if (stale.length > 0) {
    await admin.storage.from(CONTRACT_BUCKET).remove(stale);
  }

  const { error: updateError } = await admin
    .from("plays")
    .update({
      contract_file_path: path,
      contract_file_name: fileName,
      contract_uploaded_at: new Date().toISOString(),
    })
    .eq("id", playId);
  if (updateError) throw updateError;
}

// Public, unauthenticated surface: the /approve/[token] page and these two
// actions are how management/the artist respond to an offer without a Base
// Camp login. Both go through the get_play_approval_summary and
// respond_to_play_approval SECURITY DEFINER functions (see migration
// add_play_approval_response_flow) rather than touching the plays table
// directly -- RLS on plays stays authenticated-only, and these RPCs are the
// only crack the anon role gets, each scoped to a single row by an
// unguessable token rather than an attacker-suppliable id.

export type ResponderOption = { id: string; fullName: string };

export type ApprovalSummary = {
  playId: string;
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  dealTerms: string | null;
  capacity: number | null;
  status: string;
  respondedAt: string | null;
  // Who the approval email actually went to -- the public page limits its
  // "who's responding?" dropdown to this list (plus a free-text fallback)
  // rather than every contact ever linked to the artist. See
  // get_play_approval_summary, which mirrors sendApprovalEmailIfNeeded's
  // own recipient logic in app/actions/records.ts.
  responderOptions: ResponderOption[];
  // Set once someone has responded -- the matched contact's name, or the
  // free-text name they typed if they weren't in responderOptions.
  respondedByName: string | null;
};

type SummaryRow = {
  play_id: string;
  artist_name: string;
  venue_label: string;
  location: string | null;
  show_date: string | null;
  guarantee_amount: number | null;
  deal_terms: string | null;
  capacity: number | null;
  status: string;
  approval_responded_at: string | null;
  responder_options: { id: string; full_name: string }[] | null;
  responded_by_name: string | null;
};

export async function getApprovalSummary(token: string): Promise<ApprovalSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_play_approval_summary", { p_token: token })
    .maybeSingle<SummaryRow>();

  if (error || !data) return null;

  return {
    playId: data.play_id,
    artistName: data.artist_name,
    venueLabel: data.venue_label,
    location: data.location,
    showDate: data.show_date,
    guaranteeAmount: data.guarantee_amount,
    dealTerms: data.deal_terms,
    capacity: data.capacity,
    status: data.status,
    respondedAt: data.approval_responded_at,
    responderOptions: (data.responder_options ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
    })),
    respondedByName: data.responded_by_name,
  };
}

type RespondRow = {
  result: string;
  play_id: string | null;
  artist_name: string | null;
  venue_label: string | null;
  location: string | null;
  show_date: string | null;
  guarantee_amount: number | null;
  deal_terms: string | null;
  capacity: number | null;
  decision: string | null;
  note: string | null;
  agent_name: string | null;
  agent_email: string | null;
};

async function respond(
  token: string,
  decision: "approved" | "declined",
  note: string | undefined,
  contactId: string | null,
  otherName: string | null
): Promise<void> {
  const supabase = await createClient();
  // Errors here (bad token, already responded) are swallowed rather than
  // thrown -- the page re-fetches the summary right after and renders
  // whatever the real state turns out to be, which covers both cases
  // (invalid token -> null summary; already responded -> respondedAt set)
  // without needing a separate error path.
  const { data } = await supabase
    .rpc("respond_to_play_approval", {
      p_token: token,
      p_decision: decision,
      p_note: note ?? null,
      p_contact_id: contactId,
      p_other_name: otherName,
    })
    .maybeSingle<RespondRow>();

  // Only a genuine, first-time response (result "ok") closes the loop back
  // to the agent -- a double-submit or invalid/expired token has nothing
  // new to tell them. No agent on file for this artist means no one to
  // notify; the response itself still went through.
  if (data?.result === "ok" && data.agent_email && data.play_id) {
    // Approval is the moment the deal is locked in, so this is also when
    // the contract gets generated and handed to the agent -- see the
    // manual-send-fallback decision: Base Camp fills and attaches the
    // contract, but a human still reviews it and sends it on to the buyer
    // (no e-signature integration yet). A generation failure here (missing
    // template, unexpected data shape) must never block the approval-
    // response email itself, so it's caught and logged, and the email goes
    // out without an attachment -- sendApprovalResponseEmail's copy already
    // covers that case by pointing the agent at the play page instead.
    let contractAttachment: { filename: string; base64: string } | undefined;
    if (decision === "approved") {
      const contract = await generateContractForPlay(data.play_id).catch((err) => {
        console.error("Contract generation failed during approval response:", err);
        return null;
      });
      if (contract?.ok) {
        contractAttachment = { filename: contract.fileName, base64: contract.base64 };
        await saveContractToPlay(data.play_id, contract.fileName, contract.base64).catch(
          (err) => {
            console.error("Saving the generated contract to the play failed:", err);
          }
        );
      } else if (contract && !contract.ok) {
        console.error("Contract generation failed during approval response:", contract.error);
      }
    }

    await sendApprovalResponseEmail({
      to: data.agent_email,
      decision: decision,
      note: data.note,
      artistName: data.artist_name ?? "",
      venueLabel: data.venue_label ?? "Venue TBD",
      location: data.location,
      showDate: data.show_date,
      guaranteeAmount: data.guarantee_amount,
      dealTerms: data.deal_terms,
      capacity: data.capacity,
      playUrl: `https://base-camp-lovat.vercel.app/plays/${data.play_id}`,
      contractAttachment,
    }).catch((err) => {
      console.error("Approval-response notification failed:", err);
    });
  }
}

// Reads the "who's responding?" fields present on both the approve and
// decline forms -- a select scoped to responderOptions, plus a free-text
// fallback for anyone not in that list (e.g. a forwarded email). At least
// one is required before a response is recorded; see the missing-responder
// redirect in approveOffer/declineOffer below.
function parseResponder(formData: FormData): { contactId: string | null; otherName: string | null } {
  const contactIdRaw = ((formData.get("responderContactId") as string | null) ?? "").trim();
  const otherNameRaw = ((formData.get("responderOtherName") as string | null) ?? "").trim();
  return {
    contactId: contactIdRaw ? contactIdRaw : null,
    otherName: otherNameRaw ? otherNameRaw : null,
  };
}

export async function approveOffer(token: string, formData: FormData): Promise<void> {
  const { contactId, otherName } = parseResponder(formData);
  if (!contactId && !otherName) {
    redirect(`/approve/${token}?error=missing_responder`);
  }
  await respond(token, "approved", undefined, contactId, otherName);
  redirect(`/approve/${token}`);
}

export async function declineOffer(token: string, formData: FormData): Promise<void> {
  const note = (formData.get("note") as string | null)?.trim() || undefined;
  const { contactId, otherName } = parseResponder(formData);
  if (!contactId && !otherName) {
    redirect(`/approve/${token}?error=missing_responder`);
  }
  await respond(token, "declined", note, contactId, otherName);
  redirect(`/approve/${token}`);
}
