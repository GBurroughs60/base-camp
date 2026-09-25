"use client";

import { type TierDraft, makeEmptyTierDraft } from "@/lib/ticketTiers";
import { TrashIcon } from "./icons";

const cellInput =
  "rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50";

// Unlimited free-text-labeled price tiers (ADV/DOS/VIP or anything else),
// none of it required. Deliberately starts as a single plain price box with
// no visible label field -- "+ Add another tier" is what reveals labels
// (on every row, including the first, once there's more than one to tell
// apart) so the common single-price case stays exactly as simple as it was
// before this existed. A row keeps its label input visible even alone if
// it already has a label, so removing tiers back down to one never hides
// data that's still there.
export default function TicketTierEditor({
  tiers,
  onChange,
  onCommit,
  withQuantity = false,
  disabled = false,
  priceLabel = "Price",
}: {
  tiers: TierDraft[];
  onChange: (tiers: TierDraft[]) => void;
  /** Fires when a change should actually be persisted -- on blur of any
   * input, and immediately after adding/removing a row. Omit for a form
   * that saves everything together on its own submit (e.g. BookForm). */
  onCommit?: () => void;
  withQuantity?: boolean;
  disabled?: boolean;
  priceLabel?: string;
}) {
  const rows = tiers.length > 0 ? tiers : [makeEmptyTierDraft()];

  function update(i: number, patch: Partial<TierDraft>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onChange([...rows, makeEmptyTierDraft()]);
    onCommit?.();
  }

  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [makeEmptyTierDraft()]);
    onCommit?.();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => {
        const showLabel = rows.length > 1 || row.label.trim() !== "";
        return (
          <div key={i} className="flex items-center gap-1.5">
            {showLabel && (
              <input
                type="text"
                placeholder="Label (ADV, DOS, VIP…)"
                value={row.label}
                disabled={disabled}
                onChange={(e) => update(i, { label: e.target.value })}
                onBlur={onCommit}
                className={cellInput + " w-32"}
              />
            )}
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder={priceLabel}
              value={row.price}
              disabled={disabled}
              onChange={(e) => update(i, { price: e.target.value })}
              onBlur={onCommit}
              className={cellInput + " w-24"}
            />
            {withQuantity && (
              <input
                type="number"
                min="0"
                step="1"
                placeholder="Qty sold"
                value={row.quantity}
                disabled={disabled}
                onChange={(e) => update(i, { quantity: e.target.value })}
                onBlur={onCommit}
                className={cellInput + " w-24"}
              />
            )}
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(i)}
                disabled={disabled}
                aria-label="Remove tier"
                className="text-black/30 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-colors shrink-0"
              >
                <TrashIcon className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="self-start text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        + Add another tier
      </button>
    </div>
  );
}
