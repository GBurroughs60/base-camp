"use server";

import { createClient } from "@/lib/supabase/server";
import { sendNewOfferEmail } from "@/lib/approvalEmail";

// Public, unauthenticated surface: the /book page and these two actions are
// how outside venues/promoters/buyers submit a new offer without a Base
// Camp login. Both go through SECURITY DEFINER functions (list_bookable_artists,
// submit_offer_inquiry -- see migration add_offer_inquiry_rpcs) rather than
// touching artists/plays/contacts/companies directly -- RLS on those tables
// stays authenticated-only, and these two narrowly-scoped, insert-only RPCs
// are the only crack the anon role gets.

// Fallback recipient for the new-offer notification when the submitting
// artist has no 'agent' contact on file -- ensures a public-form submission
// is never silently invisible just because that link is missing.
const FALLBACK_NOTIFY_EMAIL = "gburroughs@theridgemusicgroup.com";

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
  artistId: string;
  venueName: string;
  address: string;
  city: string;
  state: string;
  showDate: string;
  showType: string;
  capacity: string;
  ageLimit: string;
  guaranteeAmount: string;
  dealTerms: string;
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

export async function submitOfferInquiry(input: OfferIntakeInput): Promise<SubmitResult> {
  // Honeypot: a hidden field no real visitor can see or fill. A bot's
  // autofill catches it -- silently report success so it has no signal it
  // was caught, but skip the actual insert entirely.
  if (input.companyUrl.trim() !== "") {
    return { ok: true };
  }

  if (!input.artistId) {
    return { ok: false, error: "Please select an artist." };
  }
  if (!input.buyerName.trim() || !input.buyerEmail.trim()) {
    return { ok: false, error: "Your name and email are required." };
  }

  const supabase = await createClient();

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
    })
    .maybeSingle<RpcRow>();

  if (error || !data || data.result !== "ok") {
    return {
      ok: false,
      error: "Something went wrong submitting this offer. Please try again or reach out directly.",
    };
  }

  if (data.play_id) {
    // Fall back to Greg directly when the artist has no agent contact on
    // file -- an offer submitted through the public form must never go
    // completely unnoticed just because contact_artists is missing an
    // 'agent' row for that artist.
    const notifyEmail = data.agent_email ?? FALLBACK_NOTIFY_EMAIL;
    await sendNewOfferEmail({
      to: notifyEmail,
      artistName: data.artist_name ?? "",
      buyerName: input.buyerName.trim(),
      venueLabel: toTextOrNull(input.venueName) ?? "Venue TBD",
      location: [input.city, input.state].filter((s) => s.trim()).join(", ") || null,
      showDate: toTextOrNull(input.showDate),
      playUrl: `https://base-camp-lovat.vercel.app/plays/${data.play_id}`,
    }).catch((err) => {
      console.error("New-offer notification failed:", err);
    });
  }

  return { ok: true };
}
