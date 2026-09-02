"use client";

import { useState } from "react";
import { generateContractForPlay } from "@/app/actions/contract";

// Staff-only preview/download for the auto-generated contract -- lets Ridge
// see and check the merge output against real play data before any of the
// agent-review-and-send flow exists. Not wired to email or status changes
// yet; this is purely "generate it and look at it."
export default function GenerateContractButton({ playId }: { playId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      const res = await generateContractForPlay(playId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the contract.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      <button
        onClick={handleClick}
        disabled={busy}
        className="text-xs border border-black/15 dark:border-white/15 rounded-md px-2.5 py-1 hover:border-ridge-orange/50 disabled:opacity-50"
      >
        {busy ? "Generating…" : "Generate contract (preview)"}
      </button>
      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  );
}
