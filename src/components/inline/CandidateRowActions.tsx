"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addCandidateToBaseCamp, dismissCandidate } from "@/app/actions/candidates";

// Per-row Add/Dismiss for the candidates review table -- same shape as
// ContractReviewActions.tsx (local pending/confirm state, calls a
// dedicated action, router.refresh() on success). Name/email/phone/
// company/event are read from the row's current (already-saved) values at
// click time, so whatever was fixed via InlineEditField/InlineRelationField
// just before clicking "Add to Base Camp" is exactly what gets imported.
export default function CandidateRowActions({
  candidateId,
  name,
  email,
  phone,
  companyId,
  eventId,
}: {
  candidateId: string;
  name: string | null;
  email: string;
  phone: string | null;
  companyId: string | null;
  eventId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"add" | "dismiss" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);

  const canAdd = !!name?.trim();

  function handleAdd() {
    if (!canAdd) return;
    setBusy("add");
    setError(null);
    startTransition(async () => {
      const res = await addCandidateToBaseCamp(candidateId, {
        fullName: name!.trim(),
        email: email || null,
        phone: phone || null,
        companyId,
        eventId,
      });
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDismiss() {
    setBusy("dismiss");
    setError(null);
    setConfirmingDismiss(false);
    startTransition(async () => {
      const res = await dismissCandidate(candidateId);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending || !canAdd}
          title={canAdd ? "Add to Base Camp" : "Add a name first"}
          className="rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          {busy === "add" ? "Adding…" : "Add"}
        </button>
        {confirmingDismiss ? (
          <span className="text-xs whitespace-nowrap">
            <button
              type="button"
              onClick={handleDismiss}
              disabled={pending}
              className="text-red-500 font-medium hover:underline underline-offset-4 disabled:opacity-50"
            >
              {busy === "dismiss" ? "Dismissing…" : "Confirm"}
            </button>{" "}
            <button
              type="button"
              onClick={() => setConfirmingDismiss(false)}
              className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingDismiss(true)}
            disabled={pending}
            className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50 whitespace-nowrap"
          >
            Dismiss
          </button>
        )}
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
