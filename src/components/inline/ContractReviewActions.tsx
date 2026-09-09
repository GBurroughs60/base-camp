"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  regenerateContract,
  sendContractToBuyer,
  voidContractSignature,
} from "@/app/actions/contractReview";

type SignatureStatus = {
  status: string;
  artist_signer_status: string;
  buyer_signer_status: string;
  sent_at: string;
} | null;

function signerLabel(status: string): string {
  if (status === "signed") return "signed";
  if (status === "viewed") return "viewed, not yet signed";
  if (status === "declined") return "declined to sign";
  return "not yet signed";
}

export default function ContractReviewActions({
  playId,
  hasContract,
  signature,
}: {
  playId: string;
  hasContract: boolean;
  signature: SignatureStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyAction, setBusyAction] = useState<"regenerate" | "send" | "void" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Both "send" and "void" have real, hard-to-reverse consequences (a live
  // signature request landing in someone's inbox; cancelling one that's
  // outstanding) -- neither fires on a single click.
  const [confirming, setConfirming] = useState<"send" | "void" | null>(null);

  function run(action: "regenerate" | "send" | "void", task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setBusyAction(action);
    setError(null);
    setConfirming(null);
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

  const outstanding = signature?.status === "sent" || signature?.status === "partially_signed";

  return (
    <div className="text-sm">
      {signature ? (
        <div className="mb-3">
          {signature.status === "completed" && (
            <p className="text-emerald-700 dark:text-emerald-400 font-medium">
              Fully signed by both parties
            </p>
          )}
          {outstanding && (
            <>
              <p className="font-medium">
                Sent for signature {new Date(signature.sent_at).toLocaleDateString("en-US", { dateStyle: "medium" })}
              </p>
              <p className="text-xs text-black/50 dark:text-white/50 mt-1">
                Artist rep: {signerLabel(signature.artist_signer_status)} · Buyer:{" "}
                {signerLabel(signature.buyer_signer_status)}
              </p>
            </>
          )}
          {signature.status === "declined" && (
            <p className="text-red-500 font-medium">
              Declined -- artist rep: {signerLabel(signature.artist_signer_status)}, buyer:{" "}
              {signerLabel(signature.buyer_signer_status)}
            </p>
          )}
          {signature.status === "voided" && (
            <p className="text-xs text-black/50 dark:text-white/50">
              Previous signature request voided -- ready to send again.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        {outstanding ? (
          confirming === "void" ? (
            <span className="text-xs">
              Cancel this signature request?{" "}
              <button
                onClick={() => run("void", () => voidContractSignature(playId))}
                disabled={pending}
                className="text-red-500 font-medium hover:underline underline-offset-4 disabled:opacity-50"
              >
                {busyAction === "void" ? "Voiding…" : "Yes, void it"}
              </button>{" "}
              <button
                onClick={() => setConfirming(null)}
                className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirming("void")}
              disabled={pending}
              className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50"
            >
              Void signature request
            </button>
          )
        ) : confirming === "send" ? (
          <span className="text-xs">
            Send to the artist rep and buyer for signature? They&apos;ll each get an email and this
            can&apos;t be undone once they open it.{" "}
            <button
              onClick={() => run("send", () => sendContractToBuyer(playId))}
              disabled={pending}
              className="text-ridge-orange font-medium hover:underline underline-offset-4 disabled:opacity-50"
            >
              {busyAction === "send" ? "Sending…" : "Yes, send it"}
            </button>{" "}
            <button
              onClick={() => setConfirming(null)}
              className="text-black/50 dark:text-white/50 hover:underline underline-offset-4"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirming("send")}
            disabled={pending}
            className="bg-ridge-orange hover:bg-ridge-orange-dark text-white text-sm font-medium rounded-md px-4 py-2 disabled:opacity-50"
          >
            Send to buyer
          </button>
        )}
        <button
          onClick={() => run("regenerate", () => regenerateContract(playId))}
          disabled={pending || outstanding}
          className="text-xs border border-black/15 dark:border-white/15 rounded-md px-2.5 py-1.5 hover:border-ridge-orange/50 disabled:opacity-50"
          title={outstanding ? "Void the outstanding request before regenerating" : undefined}
        >
          {busyAction === "regenerate"
            ? "Regenerating…"
            : hasContract
              ? "Regenerate from current data"
              : "Generate contract"}
        </button>
      </div>
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
      {!signature && (
        <p className="text-xs text-black/40 dark:text-white/40 mt-2">
          Fixed something below? Regenerate to update the saved file, or just click &quot;Send to
          buyer&quot; when you&apos;re done -- it always regenerates once more first and sends to
          both the artist rep and the buyer for signature.
        </p>
      )}
    </div>
  );
}
