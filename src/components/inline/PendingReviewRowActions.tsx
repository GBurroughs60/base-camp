"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { approveForOutreach, type ApproveOutcome } from "@/app/actions/pendingReview";

// Per-row "Approve for outreach" for the Pending Review admin page. Shape
// borrows from CandidateRowActions.tsx (local pending/confirm state, a
// dedicated server action, router.refresh() on completion), but adds an
// explicit outcome receipt step CandidateRowActions doesn't have: Greg
// wants the exact event name/location/id and the true->false result shown
// *after* a confirmed change, and wants non-approval outcomes (already
// approved, archived, stale, error) told apart from an actual approval --
// not folded into one generic success/fail. The row isn't removed from
// the list (via router.refresh()) until the operator dismisses that
// receipt, so it stays on screen long enough to read rather than being
// swept away by the list refetch that would otherwise unmount it
// immediately. None of this is saved anywhere -- v1 deliberately has no
// Google Sheets append and no email-alert fallback (Greg, 2026-11-11);
// this receipt is the only record of the change, and only for as long as
// it's on screen.
export default function PendingReviewRowActions({
  eventId,
  name,
  city,
  state,
}: {
  eventId: string;
  name: string;
  city: string | null;
  state: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ApproveOutcome | null>(null);

  const location = [city, state].filter(Boolean).join(", ") || "location unknown";

  function handleConfirm() {
    setBusy(true);
    startTransition(async () => {
      const outcome = await approveForOutreach(eventId);
      setBusy(false);
      setConfirming(false);
      setResult(outcome);
    });
  }

  function handleDismiss() {
    setResult(null);
    // Re-fetches the page's row list now that the receipt's been read --
    // this is what actually drops the row if it's no longer pending
    // (approved, already approved, archived, or gone). Deliberately not
    // called automatically on receiving the result, so the receipt isn't
    // unmounted out from under the operator before they've seen it.
    router.refresh();
  }

  if (result) {
    return (
      <div className="max-w-sm text-sm">
        <p className="font-medium mb-1">{resultHeadline(result)}</p>
        <p className="text-xs text-black/60 dark:text-white/60 mb-1">
          {name} — {location} (ID: <span className="font-mono">{eventId}</span>)
        </p>
        {resultDetail(result) && (
          <p className="text-xs text-black/60 dark:text-white/60 mb-2">{resultDetail(result)}</p>
        )}
        <p className="text-xs text-black/40 dark:text-white/40 mb-2 italic">
          This is a one-time confirmation shown on screen only -- no audit record was saved.
        </p>
        <button
          type="button"
          onClick={handleDismiss}
          className="text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          OK
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="max-w-sm text-sm">
        <p className="text-xs text-black/70 dark:text-white/70 mb-1">
          Approve <span className="font-medium">{name}</span> — {location} (ID:{" "}
          <span className="font-mono">{eventId}</span>) for outreach?
        </p>
        <p className="text-xs text-black/50 dark:text-white/50 mb-2">
          This clears Pending Review only. Needs Date, dedup, refresh, genre/fit, and outreach
          eligibility checks are unchanged. It does not send a pitch, create a date, or mark
          outreach complete.
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={pending || busy}
            className="rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50 whitespace-nowrap"
          >
            {busy ? "Approving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending || busy}
            className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors whitespace-nowrap"
    >
      Approve for outreach
    </button>
  );
}

function resultHeadline(result: ApproveOutcome): string {
  switch (result.outcome) {
    case "approved":
      return "Approved -- Pending Review: true -> false";
    case "already_approved":
      return "No change -- Pending Review was already cleared";
    case "archived":
      return "No change -- this event is archived";
    case "pending_hard_delete":
      return "No change -- this event is pending hard delete";
    case "not_found":
      return "No change -- this event could not be found";
    case "invalid_id":
      return "No change -- invalid event ID";
    case "error":
      return "No change -- the update failed";
  }
}

function resultDetail(result: ApproveOutcome): string | null {
  if (result.outcome === "error") return result.error;
  if (result.outcome === "already_approved" || result.outcome === "archived" || result.outcome === "pending_hard_delete") {
    return "Someone or something already changed this record's state before this request reached it. Nothing was approved by this request.";
  }
  return null;
}
