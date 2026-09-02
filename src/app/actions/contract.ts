"use server";

import { createClient } from "@/lib/supabase/server";
import { generateContractDocx, CONTRACT_TBD, type ContractMergeData } from "@/lib/generateContract";

// Used specifically for Section 2 (Schedule) fields Base Camp has no
// structured data for -- distinct from CONTRACT_TBD, which still applies
// everywhere else a value is genuinely missing.
const SCHEDULE_PER_ADVANCE = "Per Advance";

function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return CONTRACT_TBD;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function fmtDate(d: string | null): string {
  if (!d) return CONTRACT_TBD;
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return CONTRACT_TBD;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function yesNo(b: boolean | null): string {
  return b ? "Yes" : "No";
}

function orTbd(v: string | null | undefined): string {
  const trimmed = (v ?? "").trim();
  return trimmed ? trimmed : CONTRACT_TBD;
}

type GenerateResult =
  | { ok: true; base64: string; fileName: string }
  | { ok: false; error: string };

// Builds the merge data for one play and fills the contract template. Kept
// as a single server action (rather than splitting data-gathering out) since
// nothing else needs the intermediate ContractMergeData shape yet -- if the
// future agent-review-and-send flow needs to reuse it, split then rather
// than guessing the right seam now.
export async function generateContractForPlay(playId: string): Promise<GenerateResult> {
  const supabase = await createClient();

  const { data: play } = await supabase
    .from("plays")
    .select(
      `id, show_date, venue_name, address, city, state, show_type, bill_position,
       other_artists_on_bill, capacity, age_limit, contract_due_date,
       guarantee_amount, ticket_price, deal_terms, deposit_amount, deposit_due_date,
       production_contact_name, production_contact_info, production_provided,
       food_provided, drinks_provided, hotel_provided, travel_provided,
       governing_law_state, show_time, show_length, radius_clause, artist_id,
       artists(id, name, legal_entity_name, signatory_contact_id),
       primary_contact:contacts(id, full_name, email, phone, company_id)`
    )
    .eq("id", playId)
    .maybeSingle();

  if (!play) return { ok: false, error: "Play not found." };

  const artist = play.artists as unknown as {
    id: string;
    name: string;
    legal_entity_name: string | null;
    signatory_contact_id: string | null;
  } | null;
  if (!artist) return { ok: false, error: "This play has no artist on file." };

  const purchaserContact = play.primary_contact as unknown as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    company_id: string | null;
  } | null;

  // The contracting "Purchaser" is the buyer's company when there is one
  // (the actual purchasing entity); the buyer contact is the signatory,
  // shown separately in the signature block below.
  let purchaserCompanyName: string | null = null;
  if (purchaserContact?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", purchaserContact.company_id)
      .maybeSingle();
    purchaserCompanyName = company?.name ?? null;
  }

  let signatory: { full_name: string; email: string | null; phone: string | null } | null = null;
  if (artist.signatory_contact_id) {
    const { data: sig } = await supabase
      .from("contacts")
      .select("full_name, email, phone")
      .eq("id", artist.signatory_contact_id)
      .maybeSingle();
    signatory = sig ?? null;
  }

  const cityState = [play.city, play.state].filter(Boolean).join(", ") || null;

  const data: ContractMergeData = {
    agreement_date: fmtDate(new Date().toISOString().slice(0, 10)),
    artist_legal_entity: orTbd(artist.legal_entity_name ?? artist.name),
    purchaser_name: orTbd(purchaserCompanyName ?? purchaserContact?.full_name ?? null),
    artist_name: orTbd(artist.name),
    show_date: fmtDate(play.show_date),
    venue_name: orTbd(play.venue_name),
    show_type: orTbd(play.show_type),
    address: orTbd(play.address),
    city_state: orTbd(cityState),
    bill_position: orTbd(play.bill_position),
    other_artists_on_bill: play.other_artists_on_bill?.trim() ? play.other_artists_on_bill : "None",
    capacity: play.capacity != null ? String(play.capacity) : CONTRACT_TBD,
    age_limit: orTbd(play.age_limit),
    // Radius clauses aren't part of every deal -- "N/A" is a legitimate
    // default here when blank, same as before; now uses the real value
    // collected on the /book form (or entered manually) when there is one.
    radius_clause: play.radius_clause?.trim() ? play.radius_clause : "N/A",
    contract_due_date: fmtDate(play.contract_due_date),
    // Performance time and duration are now real fields (collected on the
    // /book form, or editable manually) -- used when filled in, falling
    // back to "Per Advance" otherwise. Load-in, soundcheck, doors, and
    // curfew still have no structured field anywhere in Base Camp, so
    // those always read "Per Advance" -- the standard live-music
    // convention that these get nailed down on the pre-show advance call,
    // matching Section 2's own closing line.
    load_in: SCHEDULE_PER_ADVANCE,
    soundcheck_time: SCHEDULE_PER_ADVANCE,
    doors_time: SCHEDULE_PER_ADVANCE,
    show_time: play.show_time?.trim() ? play.show_time : SCHEDULE_PER_ADVANCE,
    show_length: play.show_length?.trim() ? play.show_length : SCHEDULE_PER_ADVANCE,
    curfew: SCHEDULE_PER_ADVANCE,
    guarantee_amount: fmtMoney(play.guarantee_amount),
    ticket_price: play.ticket_price != null ? fmtMoney(play.ticket_price) : "N/A",
    deal_terms: orTbd(play.deal_terms),
    deposit_amount: fmtMoney(play.deposit_amount),
    deposit_due_date: fmtDate(play.deposit_due_date),
    production_contact_name: orTbd(play.production_contact_name),
    production_contact_info: orTbd(play.production_contact_info),
    production_provided: play.production_provided ? "Purchaser" : "Artist",
    hotel_provided: yesNo(play.hotel_provided),
    food_provided: yesNo(play.food_provided),
    drinks_provided: yesNo(play.drinks_provided),
    travel_provided: yesNo(play.travel_provided),
    governing_law_state: orTbd(play.governing_law_state),
    artist_rep_name: orTbd(signatory?.full_name ?? null),
    artist_rep_email: orTbd(signatory?.email ?? null),
    artist_rep_phone: orTbd(signatory?.phone ?? null),
    purchaser_signatory_name: orTbd(purchaserContact?.full_name ?? null),
    purchaser_email: orTbd(purchaserContact?.email ?? null),
    purchaser_phone: orTbd(purchaserContact?.phone ?? null),
  };

  const buf = await generateContractDocx(data);
  const safeArtistName = artist.name.replace(/[^a-zA-Z0-9]+/g, "_");
  const fileName = `${safeArtistName}_Performance_Agreement_${play.show_date ?? "TBD"}.docx`;

  return { ok: true, base64: buf.toString("base64"), fileName };
}
