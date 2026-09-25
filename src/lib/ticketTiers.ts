// Shared shape for the ticket-price-tier feature (pre-show quoted tiers on
// plays.ticket_price_tiers, post-show actuals on plays.actual_ticket_tiers).
// Free-text label ("ADV", "DOS", "VIP", or blank for a single flat price) +
// price, with an optional quantity on the actuals side. Kept framework-
// agnostic (no "use client", no Supabase) so both server actions/RPC
// callers and the editor components can share one definition instead of
// three copies drifting apart.

// String-valued draft used while editing in a form -- lets an input be
// legitimately empty without coercing to 0, which would be indistinguishable
// from "someone typed a real zero" (a real, if unusual, ticket price).
export type TierDraft = { label: string; price: string; quantity: string };

// What actually gets stored in the jsonb column / sent to the RPC -- only
// rows with a real price make it this far (see draftsToSaved).
export type SavedPriceTier = { label: string; price: number };
export type SavedActualTier = { label: string; price: number; quantity: number };

export function makeEmptyTierDraft(): TierDraft {
  return { label: "", price: "", quantity: "" };
}

// Drops any row where price was never filled in (an incomplete/blank row,
// including the default single empty row when nobody added a tier at all)
// and trims labels. Quantity defaults to 0 when left blank on the actuals
// side -- a tier that was quoted but had no blank-vs-zero ambiguity worth
// preserving there, unlike price.
export function draftsToSavedPriceTiers(drafts: TierDraft[]): SavedPriceTier[] {
  return drafts
    .filter((d) => d.price.trim() !== "" && Number.isFinite(Number(d.price)))
    .map((d) => ({ label: d.label.trim(), price: Number(d.price) }));
}

export function draftsToSavedActualTiers(drafts: TierDraft[]): SavedActualTier[] {
  return drafts
    .filter((d) => d.price.trim() !== "" && Number.isFinite(Number(d.price)))
    .map((d) => ({
      label: d.label.trim(),
      price: Number(d.price),
      quantity: d.quantity.trim() && Number.isFinite(Number(d.quantity)) ? Number(d.quantity) : 0,
    }));
}

export function savedToDrafts(
  saved: (SavedPriceTier | SavedActualTier)[] | null | undefined
): TierDraft[] {
  const rows = (saved ?? []).map((t) => ({
    label: t.label ?? "",
    price: t.price != null ? String(t.price) : "",
    quantity: "quantity" in t && t.quantity != null ? String(t.quantity) : "",
  }));
  return rows.length > 0 ? rows : [makeEmptyTierDraft()];
}
