"use server";

import { createClient } from "@/lib/supabase/server";
import { generateContractDocx, CONTRACT_TBD, type ContractMergeData } from "@/lib/generateContract";

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
       guarantee_amount, deal_terms, deposit_amount, deposit_due_date,
       production_contact_name, production_contact_info, production_provided,
       food_provided, drinks_provided, hotel_provided, travel_provided,
       governing_law_state, artist_id,
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
    // default here, unlike the day-of schedule fields below where Base
    // Camp genuinely has no data and CONTRACT_TBD is the honest answer.
    radius_clause: "N/A",
    contract_due_date: fmtDate(play.contract_due_date),
    // No structured fields exist yet for day-of schedule details (load-in,
    // soundcheck, doors, set time/length, curfew) -- left as an explicit
    // fill-in-before-sending marker rather than guessed from notes/details.
    load_in: CONTRACT_TBD,
    soundcheck_time: CONTRACT_TBD,
    doors_time: CONTRACT_TBD,
    show_time: CONTRACT_TBD,
    show_length: CONTRACT_TBD,
    curfew: CONTRACT_TBD,
    guarantee_amount: fmtMoney(play.guarantee_amount),
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
