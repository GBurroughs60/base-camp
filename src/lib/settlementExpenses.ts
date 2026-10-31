// Shared shape for the post-show Expenses tracker on plays.settlement_expenses
// (docs/operations-accounting-plan.md section 4) -- day-of costs the artist
// paid out of pocket (sound engineer tips, etc.), the thing the old paper
// show report's "Net Walkaway" field was actually capturing before this
// plan separated that out from walkout_amount (real overage beyond the
// guarantee). Deliberately informational only: nothing here ever feeds the
// commission formula, which only ever adds guarantee + walkout + merch.
//
// Mirrors ticketTiers.ts's TierDraft/SavedPriceTier split exactly (string
// draft while editing so a blank input isn't coerced to 0, filtered/typed
// "saved" shape for what actually gets written) -- same convention, just a
// different row shape: label/amount/note instead of label/price/quantity.
// Kept framework-agnostic (no "use client", no Supabase) so both the server
// action and the editor components can share one definition.

export type ExpenseDraft = { label: string; amount: string; note: string };

export type SavedExpense = { label: string; amount: number; note: string };

export function makeEmptyExpenseDraft(): ExpenseDraft {
  return { label: "", amount: "", note: "" };
}

// Drops any row where amount was never filled in (an incomplete/blank row,
// including the default single empty row when nobody added an expense at
// all) and trims text fields -- same filtering rule as
// draftsToSavedPriceTiers/draftsToSavedActualTiers.
export function draftsToSavedExpenses(drafts: ExpenseDraft[]): SavedExpense[] {
  return drafts
    .filter((d) => d.amount.trim() !== "" && Number.isFinite(Number(d.amount)))
    .map((d) => ({
      label: d.label.trim(),
      amount: Number(d.amount),
      note: d.note.trim(),
    }));
}

export function savedToExpenseDrafts(saved: SavedExpense[] | null | undefined): ExpenseDraft[] {
  const rows = (saved ?? []).map((e) => ({
    label: e.label ?? "",
    amount: e.amount != null ? String(e.amount) : "",
    note: e.note ?? "",
  }));
  return rows.length > 0 ? rows : [makeEmptyExpenseDraft()];
}
