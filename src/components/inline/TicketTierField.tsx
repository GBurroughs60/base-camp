"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import TicketTierEditor from "./TicketTierEditor";
import { updateTierField, type TableName } from "@/app/actions/records";
import {
  type TierDraft,
  type SavedPriceTier,
  type SavedActualTier,
  draftsToSavedPriceTiers,
  draftsToSavedActualTiers,
  savedToDrafts,
} from "@/lib/ticketTiers";

// Persisted counterpart to TicketTierEditor -- same UI, but every commit
// (blur, or add/remove) saves straight to the play via updateTierField,
// matching how InlineEditField commits on blur elsewhere on this page. A
// ref mirrors the draft state so a commit fired synchronously right after
// an add/remove click (same event, before React re-renders) always reads
// the row that was just added/removed rather than a stale prior render.
export default function TicketTierField({
  table,
  id,
  field,
  tiers,
  withQuantity = false,
  priceLabel,
}: {
  table: TableName;
  id: string;
  field: string;
  tiers: (SavedPriceTier | SavedActualTier)[];
  withQuantity?: boolean;
  priceLabel?: string;
}) {
  const router = useRouter();
  const [drafts, setDrafts] = useState<TierDraft[]>(() => savedToDrafts(tiers));
  const draftsRef = useRef(drafts);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleChange(next: TierDraft[]) {
    draftsRef.current = next;
    setDrafts(next);
  }

  function handleCommit() {
    const saved = withQuantity
      ? draftsToSavedActualTiers(draftsRef.current)
      : draftsToSavedPriceTiers(draftsRef.current);
    startTransition(async () => {
      const res = await updateTierField(table, id, field, saved);
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
      <TicketTierEditor
        tiers={drafts}
        onChange={handleChange}
        onCommit={handleCommit}
        withQuantity={withQuantity}
        disabled={pending}
        priceLabel={priceLabel}
      />
      {error && <span className="text-xs text-red-500 block mt-1">{error}</span>}
    </div>
  );
}
