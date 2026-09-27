"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  dismissDedupFlag,
  mergeDedupRecord,
  type DedupTable,
} from "@/app/actions/dedup";

// Per-row "Not a duplicate" / "Merge" for the Needs Dedup Check view --
// same shape as CandidateRowActions.tsx (local pending/confirm state,
// calls a dedicated action, router.refresh() on success). Only rendered
// when a row actually has a dedup_match_id to act on; a flagged row
// discovery couldn't resolve to a specific candidate (rare -- an
// unparseable historical breadcrumb) has nothing to merge into, so it
// only gets the dismiss option from the caller.
export default function DedupRowActions({
  table,
  id,
  matchId,
  matchLabel,
  matchHref,
}: {
  table: DedupTable;
  id: string;
  matchId: string | null;
  matchLabel: string | null;
  matchHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"dismiss" | "merge" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingMerge, setConfirmingMerge] = useState(false);

  function handleDismiss() {
    setBusy("dismiss");
    setError(null);
    startTransition(async () => {
      const res = await dismissDedupFlag(table, id);
      setBusy(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleMerge() {
    if (!matchId) return;
    setBusy("merge");
    setError(null);
    setConfirmingMerge(false);
    startTransition(async () => {
      const res = await mergeDedupRecord(table, id, matchId);
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
      {matchLabel && (
        <span className="text-xs text-black/50 dark:text-white/50">
          Possible duplicate of{" "}
          {matchHref ? (
            <Link
              href={matchHref}
              className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
            >
              {matchLabel}
            </Link>
          ) : (
            matchLabel
          )}
        </span>
      )}
      <div className="flex items-center gap-2">
        {confirmingMerge ? (
          <span className="text-xs whitespace-nowrap">
            <button
              type="button"
              onClick={handleMerge}
              disabled={pending}
              className="text-red-500 font-medium hover:underline underline-offset-4 disabled:opacity-50"
            >
              {busy === "merge" ? "Merging…" : "Confirm merge"}
            </button>{" "}
            <button
              type="button"
              onClick={() => setConfirmingMerge(false)}
              className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
            >
              Cancel
            </button>
          </span>
        ) : (
          <>
            <button
              type="button"
              onClick={handleDismiss}
              disabled={pending}
              title="Keep both records -- this isn't actually a duplicate"
              className="rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {busy === "dismiss" ? "Clearing…" : "Not a duplicate"}
            </button>
            {matchId && (
              <button
                type="button"
                onClick={() => setConfirmingMerge(true)}
                disabled={pending}
                title="Merge into the matched record and archive this one"
                className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50 whitespace-nowrap"
              >
                Merge
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-red-500 text-xs">{error}</p>}
    </div>
  );
}
