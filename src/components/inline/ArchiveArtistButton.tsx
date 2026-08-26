"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateField } from "@/app/actions/records";
import { TrashIcon } from "./icons";

// Archiving is a soft delete: it flips artists.archived rather than
// removing the row, so plays.artist_id (which cascades on a real delete --
// see the FK) is never touched and nothing about an artist's tour history
// changes either direction. That asymmetry with DeleteRecordButton (used
// on the other four record types) is why this is its own component rather
// than another cascadeWarning case there: archiving needs no destructive
// copy, no typed confirm, and has to work both ways (archive / restore)
// from the same page.
export default function ArchiveArtistButton({
  artistId,
  archived,
  playCount,
}: {
  artistId: string;
  archived: boolean;
  playCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleToggle() {
    setSubmitting(true);
    setError(null);
    const res = await updateField("artists", artistId, "archived", !archived);
    setSubmitting(false);

    if (res.ok) {
      setOpen(false);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  // Already archived: restoring destroys nothing, so a single click is
  // enough -- no confirm modal needed on this side of the toggle.
  if (archived) {
    return (
      <button
        type="button"
        onClick={handleToggle}
        disabled={submitting}
        className="text-sm text-black/40 dark:text-white/40 hover:text-ridge-orange-dark dark:hover:text-ridge-orange transition-colors disabled:opacity-50"
      >
        {submitting ? "Restoring…" : "Restore artist"}
      </button>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-black/40 dark:text-white/40 hover:text-red-500 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5" />
        Archive
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5"
          >
            <h2 className="font-display text-lg font-medium mb-2">Archive this artist?</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              They&apos;ll be hidden from the artist list and the new-play picker, but nothing
              is deleted{playCount > 0 ? ` — all ${playCount} of their plays stay exactly as they are` : ""}.
              You can restore them from this same page anytime.
            </p>

            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleToggle}
                disabled={submitting}
                className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
              >
                {submitting ? "Archiving…" : "Archive artist"}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
