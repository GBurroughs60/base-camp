"use server";

import { createClient } from "@/lib/supabase/server";
import { sendNewOfferEmail } from "@/lib/approvalEmail";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";
import { type TierDraft, draftsToSavedPriceTiers } from "@/lib/ticketTiers";

// Public, unauthenticated surface: the /book page and these two actions are
// how outside venues/promoters/buyers submit a new offer without a Base
// Camp login. Both go through SECURITY DEFINER functions (list_bookable_artists,
// submit_offer_inquiry -- see migration add_offer_inquiry_rpcs) rather than
// touching artists/plays/contacts/companies directly -- RLS on those tables
// stays authenticated-only, and these two narrowly-scoped, insert-only RPCs
// are the only crack the anon role gets.

export type BookableArtist = { id: string; name: string };

export async function listBookableArtists(): Promise<BookableArtist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_bookable_artists");
  if (error || !data) return [];
  return data as BookableArtist[];
}

export type OfferIntakeInput = {
  // Hidden field real visitors never fill in -- see honeypot handling below.
  companyUrl: string;
  // Date.now() captured client-side the moment the form mounted (see
  // BookForm.tsx). Used alongside the honeypot as a second signal before
  // anything is ever discarded as a bot -- see the 2026-10-12 note below.
  renderedAt: number;
  artistId: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  showDate: string;
  showType: string;
  showTime: string;
  showLength: string;
  capacity: string;
  ageLimit: string;
  guaranteeAmount: string;
  ticketPriceTiers: TierDraft[];
  dealTerms: string;
  radiusClause: string;
  productionContactName: string;
  productionContactInfo: string;
  productionProvided: boolean;
  foodProvided: boolean;
  drinksProvided: boolean;
  hotelProvided: boolean;
  travelProvided: boolean;
  notes: string;
  buyerCompany: string;
  buyerName: string;
  buyerEmail: string;
  buyerPhone: string;
  buyerAddress: string;
  buyerCity: string;
  buyerState: string;
  buyerZip: string;
};

type SubmitResult = { ok: true } | { ok: false; error: string };

type RpcRow = {
  result: string;
  play_id: string | null;
  artist_name: string | null;
  agent_name: string | null;
  agent_email: string | null;
};

function toNumberOrNull(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toTextOrNull(s: string): string | null {
  const trimmed = s.trim();
  return trimmed ? trimmed : null;
}

// Below this, a filled honeypot alone no longer discards a submission --
// it also has to look fast enough to be a script, not a person who tabbed
// through the form. Fixed 2026-10-12 after a real offer (Boho Links / Ben
// Hooker) vanished with zero trace: the honeypot had apparently been
// filled by browser autofill, not a bot, and the old code reported success
// to the visitor while silently throwing the whole thing away -- no DB row,
// no email, nothing to find afterward. See docs/outreach-engine-plan.md
// section 8.
const HONEYPOT_MIN_HUMAN_MS = 2500;

// Best-effort: failures here must never block or fail a real submission,
// so every call site swallows its own errors.
async function logAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rawInput: OfferIntakeInput,
  elapsedMs: number | null
): Promise<string | null> {
  try {
    const { data } = await supabase.rpc("log_offer_inquiry_attempt", {
      p_raw_input: rawInput,
      p_elapsed_ms: elapsedMs,
    });
    return (data as string | null) ?? null;
  } catch (err) {
    console.error("offer-intake safety-net log failed (submission still proceeds):", err);
    return null;
  }
}

async function updateAttempt(
  supabase: Awaited<ReturnType<typeof createClient>>,
  attemptId: string | null,
  fields: {
    honeypotTriggered: boolean;
    outcome: string;
    playId: string | null;
    errorDetail: string | null;
  }
): Promise<void> {
  if (!attemptId) return;
  try {
    await supabase.rpc("update_offer_inquiry_attempt", {
      p_id: attemptId,
      p_honeypot_triggered: fields.honeypotTriggered,
      p_outcome: fields.outcome,
      p_play_id: fields.playId,
      p_error_detail: fields.errorDetail,
    });
  } catch (err) {
    console.error("offer-intake safety-net log update failed:", err);
  }
}

export async function submitOfferInquiry(input: OfferIntakeInput): Promise<SubmitResult> {
  const supabase = await createClient();

  const receivedAt = Date.now();
  const elapsedMs = Number.isFinite(input.renderedAt) ? receivedAt - input.renderedAt : null;
  const honeypotFilled = input.companyUrl.trim() !== "";

  // Safety net: save a copy of what was submitted before any check below
  // can possibly discard it. If `attemptId` ends up null (the log call
  // itself failed), every update below is a no-op -- the real submission
  // path is unaffected either way.
  const attemptId = await logAttempt(supabase, input, elapsedMs);

  // Honeypot, now requiring a second signal: a hidden field no real visitor
  // can see or fill, but a single false positive here (autofill, a
  // password manager) used to be enough to silently kill a real offer.
  // Only treat it as a bot -- and skip the real insert -- when the honeypot
  // was filled AND the whole form was submitted faster than a person
  // reasonably could. A filled honeypot on a normally-paced submission is
  // logged (above) but still processed as real.
  const looksLikeBot = honeypotFilled && elapsedMs !== null && elapsedMs < HONEYPOT_MIN_HUMAN_MS;
  if (looksLikeBot) {
    await updateAttempt(supabase, attemptId, {
      honeypotTriggered: true,
      outcome: "blocked_bot",
      playId: null,
      errorDetail: null,
    });
    // Still report success so a real bot gets no signal it was caught.
    return { ok: true };
  }

  if (!input.artistId) {
    await updateAttempt(supabase, attemptId, {
      honeypotTriggered: honeypotFilled,
      outcome: "validation_error",
      playId: null,
      errorDetail: "missing artistId",
    });
    return { ok: false, error: "Please select an artist." };
  }
  if (!input.buyerName.trim() || !input.buyerEmail.trim()) {
    await updateAttempt(supabase, attemptId, {
      honeypotTriggered: honeypotFilled,
      outcome: "validation_error",
      playId: null,
      errorDetail: "missing buyerName/buyerEmail",
    });
    return { ok: false, error: "Your name and email are required." };
  }

  const buyerMailingAddress =
    [
      input.buyerAddress.trim(),
      [input.buyerCity.trim(), input.buyerState.trim(), input.buyerZip.trim()]
        .filter(Boolean)
        .join(", "),
    ]
      .filter(Boolean)
      .join(", ") || null;

  const { data, error } = await supabase
    .rpc("submit_offer_inquiry", {
      p_artist_id: input.artistId,
      p_venue_name: toTextOrNull(input.venueName),
      p_address: toTextOrNull(input.address),
      p_city: toTextOrNull(input.city),
      p_state: toTextOrNull(input.state),
      p_show_date: toTextOrNull(input.showDate),
      p_show_type: toTextOrNull(input.showType),
      p_capacity: toNumberOrNull(input.capacity),
      p_age_limit: toTextOrNull(input.ageLimit),
      p_guarantee_amount: toNumberOrNull(input.guaranteeAmount),
      p_deal_terms: toTextOrNull(input.dealTerms),
      p_show_time: toTextOrNull(input.showTime),
      p_show_length: toTextOrNull(input.showLength),
      p_radius_clause: toTextOrNull(input.radiusClause),
      p_production_contact_name: toTextOrNull(input.productionContactName),
      p_production_contact_info: toTextOrNull(input.productionContactInfo),
      p_production_provided: input.productionProvided,
      p_food_provided: input.foodProvided,
      p_drinks_provided: input.drinksProvided,
      p_hotel_provided: input.hotelProvided,
      p_travel_provided: input.travelProvided,
      p_notes: toTextOrNull(input.notes),
      p_buyer_company: toTextOrNull(input.buyerCompany),
      p_buyer_name: input.buyerName.trim(),
      p_buyer_email: input.buyerEmail.trim(),
      p_buyer_phone: toTextOrNull(input.buyerPhone),
      p_buyer_mailing_address: buyerMailingAddress,
      p_buyer_city: toTextOrNull(input.buyerCity),
      p_buyer_state: toTextOrNull(input.buyerState),
      p_ticket_price_tiers: draftsToSavedPriceTiers(input.ticketPriceTiers),
    })
    .maybeSingle<RpcRow>();

  if (error || !data || data.result !== "ok") {
    await updateAttempt(supabase, attemptId, {
      honeypotTriggered: honeypotFilled,
      outcome: "rpc_error",
      playId: null,
      errorDetail: error?.message ?? data?.result ?? "unknown",
    });
    return {
      ok: false,
      error: "Something went wrong submitting this offer. Please try again or reach out directly.",
    };
  }

  await updateAttempt(supabase, attemptId, {
    honeypotTriggered: honeypotFilled,
    outcome: "ok",
    playId: data.play_id,
    errorDetail: null,
  });

  if (data.play_id) {
    // Fall back to Greg directly when the artist has no agent contact on
    // file -- an offer submitted through the public form must never go
    // completely unnoticed just because contact_artists is missing an
    // 'agent' row for that artist.
    const usingFallback = !data.agent_email;
    const notifyEmail = data.agent_email ?? FALLBACK_NOTIFY_EMAIL;
    await sendNewOfferEmail({
      to: notifyEmail,
      artistName: data.artist_name ?? "",
      buyerName: input.buyerName.trim(),
      venueLabel: toTextOrNull(input.venueName) ?? "Venue TBD",
      location: [input.city, input.state].filter((s) => s.trim()).join(", ") || null,
      showDate: toTextOrNull(input.showDate),
      playUrl: `https://base-camp-lovat.vercel.app/plays/${data.play_id}`,
      fallbackNote: usingFallback
        ? `No booking agent is on file for ${data.artist_name ?? "this artist"} -- add one on the artist's profile so future offer notifications reach them directly instead of you.`
        : undefined,
    }).catch((err) => {
      console.error("New-offer notification failed:", err);
    });
  }

  return { ok: true };
}
