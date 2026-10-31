"use client";

import { type ExpenseDraft, makeEmptyExpenseDraft } from "@/lib/settlementExpenses";
import { TrashIcon } from "./icons";

const cellInput =
  "rounded border border-black/15 dark:border-white/15 bg-transparent px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50";

// Post-show Expenses tracker (docs/operations-accounting-plan.md section 4)
// -- day-of costs the artist paid out of pocket, entirely optional. Same
// interaction pattern as TicketTierEditor on purpose (a "+" to add a row,
// nothing required up front): one row is label + amount + an optional note,
// rather than label + price + quantity. Purely informational -- this never
// feeds the commission formula.
export default function ExpenseEditor({
  expenses,
  onChange,
  onCommit,
  disabled = false,
}: {
  expenses: ExpenseDraft[];
  onChange: (expenses: ExpenseDraft[]) => void;
  /** Fires when a change should actually be persisted -- on blur of any
   * input, and immediately after adding/removing a row. Same contract as
   * TicketTierEditor's onCommit. */
  onCommit?: () => void;
  disabled?: boolean;
}) {
  const rows = expenses.length > 0 ? expenses : [makeEmptyExpenseDraft()];

  function update(i: number, patch: Partial<ExpenseDraft>) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function addRow() {
    onChange([...rows, makeEmptyExpenseDraft()]);
    onCommit?.();
  }

  function removeRow(i: number) {
    const next = rows.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : [makeEmptyExpenseDraft()]);
    onCommit?.();
  }

  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            type="text"
            placeholder="Expense (e.g. FOH engineer tip)"
            value={row.label}
            disabled={disabled}
            onChange={(e) => update(i, { label: e.target.value })}
            onBlur={onCommit}
            className={cellInput + " w-48"}
          />
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Amount"
            value={row.amount}
            disabled={disabled}
            onChange={(e) => update(i, { amount: e.target.value })}
            onBlur={onCommit}
            className={cellInput + " w-24"}
          />
          <input
            type="text"
            placeholder="Note (optional)"
            value={row.note}
            disabled={disabled}
            onChange={(e) => update(i, { note: e.target.value })}
            onBlur={onCommit}
            className={cellInput + " flex-1 min-w-0"}
          />
          {rows.length > 1 && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              disabled={disabled}
              aria-label="Remove expense"
              className="text-black/30 hover:text-red-500 dark:text-white/30 dark:hover:text-red-400 transition-colors shrink-0"
            >
              <TrashIcon className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        disabled={disabled}
        className="self-start text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
      >
        + Add an expense
      </button>
    </div>
  );
}
