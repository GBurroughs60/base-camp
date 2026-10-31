"use client";

import { useState } from "react";
import ExpenseEditor from "./ExpenseEditor";
import {
  type ExpenseDraft,
  makeEmptyExpenseDraft,
  draftsToSavedExpenses,
  savedToExpenseDrafts,
} from "@/lib/settlementExpenses";
import type { SavedExpense } from "@/lib/settlementExpenses";

// Public-page counterpart to the authenticated ExpenseField -- same
// ExpenseEditor UI, but there's no logged-in session here to call a server
// action on every blur. Instead this just keeps drafts in plain React
// state and serializes them into a hidden "settlementExpenses" field,
// which the one real submit (submitSettlement in app/actions/settlement.ts)
// reads and parses -- the whole form commits in a single POST, expenses
// included, rather than persisting field-by-field like the staff-side page.
export default function SettlementExpensesField({ initial }: { initial: SavedExpense[] }) {
  const [drafts, setDrafts] = useState<ExpenseDraft[]>(() =>
    initial.length > 0 ? savedToExpenseDrafts(initial) : [makeEmptyExpenseDraft()]
  );

  return (
    <div>
      <input type="hidden" name="settlementExpenses" value={JSON.stringify(draftsToSavedExpenses(drafts))} />
      <ExpenseEditor expenses={drafts} onChange={setDrafts} />
    </div>
  );
}
