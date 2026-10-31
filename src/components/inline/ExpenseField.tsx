"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import ExpenseEditor from "./ExpenseEditor";
import { updateExpenseField, type TableName } from "@/app/actions/records";
import {
  type ExpenseDraft,
  type SavedExpense,
  draftsToSavedExpenses,
  savedToExpenseDrafts,
} from "@/lib/settlementExpenses";

// Persisted counterpart to ExpenseEditor -- same UI, but every commit
// (blur, or add/remove) saves straight to the play via updateExpenseField.
// Mirrors TicketTierField's structure exactly, including the ref mirroring
// draft state so a commit fired synchronously right after an add/remove
// click (same event, before React re-renders) always reads the row that
// was just added/removed rather than a stale prior render.
export default function ExpenseField({
  table,
  id,
  field,
  expenses,
}: {
  table: TableName;
  id: string;
  field: string;
  expenses: SavedExpense[];
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<ExpenseDraft[]>(() => savedToExpenseDrafts(expenses));
  const draftsRef = useRef(drafts);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: ExpenseDraft[]) {
    draftsRef.current = next;
    setDrafts(next);
  }

  function handleCommit() {
    const saved = draftsToSavedExpenses(draftsRef.current);
    startTransition(async () => {
      const res = await updateExpenseField(table, id, field, saved);
      if (!res.ok) {
        setError(res.error);
      } else {
        setError(null);
        router.refresh();
      }
    });
  }

  return (
    <div>
      <ExpenseEditor
        expenses={drafts}
        onChange={handleChange}
        onCommit={handleCommit}
        disabled={pending}
      />
      {error && <span className="text-xs text-red-500 block mt-1">{error}</span>}
    </div>
  );
}
