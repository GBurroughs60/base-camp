"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateContract,
  sendContractToBuyer,
  unmarkContractSentToBuyer,
} from "@/app/actions/contractReview";

export default function ContractReviewActions({
  playId,
  hasContract,
  sentAt,
}: {
  playId: string;
  hasContract: boolean;
  sentAt: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"regenerate" | "send" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(action: "regenerate" | "send" | "undo", task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusyAction(action);
    setError(null);
    startTransition(async () => {
      const res = await task();
      setBusyAction(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {sentAt ? (
          <>
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
              Sent to buyer {new Date(sentAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
            </span>
            <button
              onClick={() => run("undo", () => unmarkContractSentToBuyer(playId))}
              disabled={pending}
              className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50"
            >
              {busyAction === "undo" ? "Undoing…" : "Undo"}
            </button>
          </>
        ) : (
          <button
            onClick={() => run("send", () => sendContractToBuyer(playId))}
            disabled={pending}
            className="bg-ridge-orange hover:bg-ridge-orange-dark text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            {busyAction === "send" ? "Sending…" : "Send to buyer"}
          </button>
        )}
        <button
          onClick={() => run("regenerate", () => regenerateContract(playId))}
          disabled={pending}
          className="text-xs border border-black/15 dark:border-white/15 rounded-md px-2.5 py-1.5 hover:border-ridge-orange/50 disabled:opacity-50"
        >
          {busyAction === "regenerate"
            ? "Regenerating…"
            : hasContract
              ? "Regenerate from current data"
              : "Generate contract"}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      {!sentAt && (
        <p className="text-xs text-black/40 dark:text-white/40 mt-2">
          Fixed something below? Regenerate to update the saved file, or just click &quot;Send to
          buyer&quot; when you&apos;re done -- it always regenerates once more first.
        </p>
      )}
    </div>
  );
}
