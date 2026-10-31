"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendSettlementReceivedEmail } from "@/lib/approvalEmail";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";
import type { SavedExpense } from "@/lib/settlementExpenses";

// Public, unauthenticated surface: the /settle/[token] page and this action
// are how the artist (or their manager/rep) reports back on a show after it
// happens, without a Base Camp login. Mirrors approval.ts's design exactly
// -- both go through SECURITY DEFINER functions (get_settlement_summary /
// submit_settlement_report, see migration add_settlement_report_flow)
// rather than touching plays directly: RLS on plays stays
// authenticated-only, and these RPCs are the only crack the anon role gets,
// each scoped to a single row by an unguessable token rather than an
// attacker-suppliable id.

export type ResponderOption = { id: string; fullName: string };

export type SettlementSummary = {
  playId: string;
  artistName: string;
  venueLabel: string;
  location: string | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  submittedAt: string | null;
  // Who the settlement-request email actually went to -- same idea as
  // responderOptions on ApprovalSummary: the public page limits its
  // "who's reporting?" dropdown to this list (plus a free-text fallback)
  // rather than every contact ever linked to the artist.
  responderOptions: ResponderOption[];
  // Set once someone has submitted -- the matched contact's name, or the
  // free-text name they typed if they weren't in responderOptions.
  submittedByName: string | null;
  walkoutAmount: number | null;
  grossMerchSales: number | null;
  settlementExpenses: SavedExpense[];
  otherEventsInTown: string | null;
  promoterNotes: string | null;
  wouldPlayAgain: string | null;
};

type SummaryRow = {
  play_id: string;
  artist_name: string;
  venue_label: string;
  location: string | null;
  show_date: string | null;
  guarantee_amount: number | null;
  settlement_submitted_at: string | null;
  responder_options: { id: string; full_name: string }[] | null;
  submitted_by_name: string | null;
  walkout_amount: number | null;
  gross_merch_sales: number | null;
  settlement_expenses: SavedExpense[] | null;
  other_events_in_town: string | null;
  promoter_notes: string | null;
  would_play_again: string | null;
};

export async function getSettlementSummary(token: string): Promise<SettlementSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("get_settlement_summary", { p_token: token })
    .maybeSingle<SummaryRow>();

  if (error || !data) return null;

  return {
    playId: data.play_id,
    artistName: data.artist_name,
    venueLabel: data.venue_label,
    location: data.location,
    showDate: data.show_date,
    guaranteeAmount: data.guarantee_amount,
    submittedAt: data.settlement_submitted_at,
    responderOptions: (data.responder_options ?? []).map((r) => ({
      id: r.id,
      fullName: r.full_name,
    })),
    submittedByName: data.submitted_by_name,
    walkoutAmount: data.walkout_amount,
    grossMerchSales: data.gross_merch_sales,
    settlementExpenses: data.settlement_expenses ?? [],
    otherEventsInTown: data.other_events_in_town,
    promoterNotes: data.promoter_notes,
    wouldPlayAgain: data.would_play_again,
  };
}

type SubmitRow = {
  result: string;
  play_id: string | null;
  artist_name: string | null;
  venue_label: string | null;
  show_date: string | null;
  walkout_amount: number | null;
  gross_merch_sales: number | null;
  would_play_again: string | null;
  agent_name: string | null;
  agent_email: string | null;
};

// Same "who's responding?" pattern as parseResponder in approval.ts -- a
// select scoped to responderOptions, plus a free-text fallback for anyone
// not in that list. At least one is required before a report is recorded.
function parseResponder(formData: FormData): { contactId: string | null; otherName: string | null } {
  const contactIdRaw = ((formData.get("responderContactId") as string | null) ?? "").trim();
  const otherNameRaw = ((formData.get("responderOtherName") as string | null) ?? "").trim();
  return {
    contactId: contactIdRaw ? contactIdRaw : null,
    otherName: otherNameRaw ? otherNameRaw : null,
  };
}

// The expenses tracker on this page keeps its drafts in plain React state
// (see SettlementExpensesField.tsx) and serializes them into this one
// hidden field on submit, rather than persisting on every blur like the
// authenticated ExpenseField does -- there's no per-field server action to
// call on a logged-out page with no session, so the whole form (including
// expenses) commits in a single submit instead.
function parseExpenses(formData: FormData): SavedExpense[] {
  const raw = (formData.get("settlementExpenses") as string | null) ?? "[]";
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is SavedExpense =>
        !!e &&
        typeof e === "object" &&
        typeof e.amount === "number" &&
        Number.isFinite(e.amount)
    );
  } catch {
    return [];
  }
}

function numberOrNull(formData: FormData, field: string): number | null {
  const raw = (formData.get(field) as string | null) ?? "";
  if (raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function textOrNull(formData: FormData, field: string): string | null {
  const raw = ((formData.get(field) as string | null) ?? "").trim();
  return raw ? raw : null;
}

export async function submitSettlement(token: string, formData: FormData): Promise<void> {
  const { contactId, otherName } = parseResponder(formData);
  if (!contactId && !otherName) {
    redirect(`/settle/${token}?error=missing_responder`);
  }

  const supabase = await createClient();
  // Errors here (bad token, already submitted) are swallowed rather than
  // thrown -- the page re-fetches the summary right after and renders
  // whatever the real state turns out to be, same as respond() in
  // approval.ts.
  const { data } = await supabase
    .rpc("submit_settlement_report", {
      p_token: token,
      p_walkout_amount: numberOrNull(formData, "walkoutAmount"),
      p_gross_merch_sales: numberOrNull(formData, "grossMerchSales"),
      p_settlement_expenses: parseExpenses(formData),
      p_other_events_in_town: textOrNull(formData, "otherEventsInTown"),
      p_promoter_notes: textOrNull(formData, "promoterNotes"),
      p_would_play_again: textOrNull(formData, "wouldPlayAgain"),
      p_contact_id: contactId,
      p_other_name: otherName,
    })
    .maybeSingle<SubmitRow>();

  // Only a genuine, first-time submission (result "ok") closes the loop
  // back to the agent -- a double-submit or invalid/expired token has
  // nothing new to tell them.
  if (data?.result === "ok" && data.play_id) {
    // No agent on file for this artist (or none with an email) falls back
    // to Greg directly, same fallback used by the other automated
    // notifications (sendApprovalEmailIfNeeded, submitOfferInquiry,
    // respond() above).
    const usingFallback = !data.agent_email;
    const recipientEmail = data.agent_email ?? FALLBACK_NOTIFY_EMAIL;

    await sendSettlementReceivedEmail({
      to: recipientEmail,
      artistName: data.artist_name ?? "",
      venueLabel: data.venue_label ?? "Venue TBD",
      showDate: data.show_date,
      walkoutAmount: data.walkout_amount,
      grossMerchSales: data.gross_merch_sales,
      wouldPlayAgain: data.would_play_again,
      playUrl: `https://base-camp-lovat.vercel.app/plays/${data.play_id}`,
      fallbackNote: usingFallback
        ? `No booking agent is on file for ${data.artist_name ?? "this artist"} -- add one on the artist's profile so future settlement reports route directly to them. You can still see this one on the play page in the meantime.`
        : undefined,
    }).catch((err) => {
      console.error("Settlement-received notification failed:", err);
    });
  }

  redirect(`/settle/${token}`);
}
