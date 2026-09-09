import { createClient } from "@/lib/supabase/server";
import { CONTRACT_TBD, type ContractMergeData } from "@/lib/generateContract";

// Used specifically for Section 2 (Schedule) fields Base Camp has no
// structured data for -- distinct from CONTRACT_TBD, which still applies
// everywhere else a value is genuinely missing.
export const SCHEDULE_PER_ADVANCE = "Per Advance";

export function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return CONTRACT_TBD;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function fmtDate(d: string | null): string {
  if (!d) return CONTRACT_TBD;
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return CONTRACT_TBD;
  return parsed.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function yesNo(b: boolean | null): string {
  return b ? "Yes" : "No";
}

export function orTbd(v: string | null | undefined): string {
  const trimmed = (v ?? "").trim();
  return trimmed ? trimmed : CONTRACT_TBD;
}

export type ContractPlay = {
  id: string;
  show_date: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  show_type: string | null;
  bill_position: string | null;
  other_artists_on_bill: string | null;
  capacity: number | null;
  age_limit: string | null;
  contract_due_date: string | null;
  guarantee_amount: number | null;
  ticket_price: number | null;
  deal_terms: string | null;
  deposit_amount: number | null;
  deposit_due_date: string | null;
  production_contact_name: string | null;
  production_contact_info: string | null;
  production_provided: boolean | null;
  food_provided: boolean | null;
  drinks_provided: boolean | null;
  hotel_provided: boolean | null;
  travel_provided: boolean | null;
  governing_law_state: string | null;
  show_time: string | null;
  show_length: string | null;
  radius_clause: string | null;
  artist_id: string;
  venue_id: string | null;
  status: string;
  contract_file_path: string | null;
  contract_file_name: string | null;
  contract_uploaded_at: string | null;
  contract_sent_to_buyer_at: string | null;
};

export type ContractVenue = { id: string; name: string; city: string | null; state: string | null };

export type ContractArtist = {
  id: string;
  name: string;
  legal_entity_name: string | null;
  signatory_contact_id: string | null;
};

export type ContractContact = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export type ContractContext = {
  play: ContractPlay;
  artist: ContractArtist;
  // Present only when the play is linked to a real venue record. When set,
  // this -- not the play's own venue_name/city/state text columns -- is
  // what the contract actually uses (see buildContractMergeData), matching
  // how the play detail page's own Venue card already prefers the linked
  // record over those columns.
  venue: ContractVenue | null;
  purchaserContact: (ContractContact & { company_id: string | null }) | null;
  purchaserCompanyName: string | null;
  signatory: ContractContact | null;
};

export type ContractContextResult =
  | { ok: true; context: ContractContext }
  | { ok: false; error: string };

// Single fetch behind both places that need this play's contract data: the
// actual docx generation (generateContractForPlay in app/actions/contract.ts)
// and the Contract Review screen (plays/[id]/contract), which shows the
// same resolved values live, with inline editing, before anything is
// generated or sent. Keeping this in one place is what keeps those two
// surfaces from drifting apart the way the Schedule fields did before they
// had real columns at all.
export async function fetchContractContext(playId: string): Promise<ContractContextResult> {
  const supabase = await createClient();

  const { data: play } = await supabase
    .from("plays")
    .select(
      `id, show_date, venue_name, address, city, state, show_type, bill_position,
       other_artists_on_bill, capacity, age_limit, contract_due_date,
       guarantee_amount, ticket_price, deal_terms, deposit_amount, deposit_due_date,
       production_contact_name, production_contact_info, production_provided,
       food_provided, drinks_provided, hotel_provided, travel_provided,
       governing_law_state, show_time, show_length, radius_clause, artist_id, venue_id,
       status, contract_file_path, contract_file_name, contract_uploaded_at, contract_sent_to_buyer_at,
       artists(id, name, legal_entity_name, signatory_contact_id),
       venue:companies!plays_venue_id_fkey(id, name, city, state),
       primary_contact:contacts!tour_stops_primary_contact_id_fkey(id, full_name, email, phone, company_id)`
    )
    .eq("id", playId)
    .maybeSingle();

  if (!play) return { ok: false, error: "Play not found." };

  const artist = play.artists as unknown as ContractArtist | null;
  if (!artist) return { ok: false, error: "This play has no artist on file." };

  const venue = play.venue as unknown as ContractVenue | null;

  const purchaserContact = play.primary_contact as unknown as
    | (ContractContact & { company_id: string | null })
    | null;

  // The contracting "Purchaser" is the buyer's company when there is one
  // (the actual purchasing entity); the buyer contact is the signatory,
  // shown separately in the signature block.
  let purchaserCompanyName: string | null = null;
  if (purchaserContact?.company_id) {
    const { data: company } = await supabase
      .from("companies")
      .select("name")
      .eq("id", purchaserContact.company_id)
      .maybeSingle();
    purchaserCompanyName = company?.name ?? null;
  }

  let signatory: ContractContact | null = null;
  if (artist.signatory_contact_id) {
    const { data: sig } = await supabase
      .from("contacts")
      .select("id, full_name, email, phone")
      .eq("id", artist.signatory_contact_id)
      .maybeSingle();
    signatory = sig ?? null;
  }

  // Listed explicitly (rather than spreading `play` minus its relations)
  // so ContractPlay stays the actual contract of what this module reads --
  // a column added to the select above without a matching field here is a
  // type error, not a silent pass-through.
  const playFields: ContractPlay = {
    id: play.id,
    show_date: play.show_date,
    venue_name: play.venue_name,
    address: play.address,
    city: play.city,
    state: play.state,
    show_type: play.show_type,
    bill_position: play.bill_position,
    other_artists_on_bill: play.other_artists_on_bill,
    capacity: play.capacity,
    age_limit: play.age_limit,
    contract_due_date: play.contract_due_date,
    guarantee_amount: play.guarantee_amount,
    ticket_price: play.ticket_price,
    deal_terms: play.deal_terms,
    deposit_amount: play.deposit_amount,
    deposit_due_date: play.deposit_due_date,
    production_contact_name: play.production_contact_name,
    production_contact_info: play.production_contact_info,
    production_provided: play.production_provided,
    food_provided: play.food_provided,
    drinks_provided: play.drinks_provided,
    hotel_provided: play.hotel_provided,
    travel_provided: play.travel_provided,
    governing_law_state: play.governing_law_state,
    show_time: play.show_time,
    show_length: play.show_length,
    radius_clause: play.radius_clause,
    artist_id: play.artist_id,
    venue_id: play.venue_id,
    status: play.status,
    contract_file_path: play.contract_file_path,
    contract_file_name: play.contract_file_name,
    contract_uploaded_at: play.contract_uploaded_at,
    contract_sent_to_buyer_at: play.contract_sent_to_buyer_at,
  };

  return {
    ok: true,
    context: {
      play: playFields,
      artist,
      venue,
      purchaserContact,
      purchaserCompanyName,
      signatory,
    },
  };
}

// Builds the actual merge data handed to the docx template from a fetched
// context -- pure and synchronous so the Contract Review screen can call it
// directly on data it already has (to show "what this will become") without
// a second round trip, exactly the shape generateContractForPlay hands to
// generateContractDocx.
export function buildContractMergeData(ctx: ContractContext): ContractMergeData {
  const { play, artist, venue, purchaserContact, purchaserCompanyName, signatory } = ctx;
  // A linked venue record wins over the play's own venue_name/city/state
  // text columns, same preference order the play detail page's Venue card
  // already uses -- those columns are really a fallback for when there's no
  // linked record at all, not a second source of truth to keep in sync
  // with one.
  const venueName = venue?.name ?? play.venue_name;
  const cityState =
    [venue?.city ?? play.city, venue?.state ?? play.state].filter(Boolean).join(", ") || null;

  return {
    agreement_date: fmtDate(new Date().toISOString().slice(0, 10)),
    artist_legal_entity: orTbd(artist.legal_entity_name ?? artist.name),
    purchaser_name: orTbd(purchaserCompanyName ?? purchaserContact?.full_name ?? null),
    artist_name: orTbd(artist.name),
    show_date: fmtDate(play.show_date),
    venue_name: orTbd(venueName),
    show_type: orTbd(play.show_type),
    address: orTbd(play.address),
    city_state: orTbd(cityState),
    bill_position: orTbd(play.bill_position),
    other_artists_on_bill: play.other_artists_on_bill?.trim() ? play.other_artists_on_bill : "None",
    capacity: play.capacity != null ? String(play.capacity) : CONTRACT_TBD,
    age_limit: orTbd(play.age_limit),
    // Radius clauses aren't part of every deal -- "N/A" is a legitimate
    // default here when blank, using the real value collected on the
    // /book form (or entered manually) when there is one.
    radius_clause: play.radius_clause?.trim() ? play.radius_clause : "N/A",
    contract_due_date: fmtDate(play.contract_due_date),
    // Performance time and duration are real fields (collected on the
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
}
