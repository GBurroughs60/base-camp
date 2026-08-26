"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { deleteRecord, type DeleteBlocker, type TableName } from "@/app/actions/records";
import { TrashIcon } from "./icons";

const LIST_ROUTE: Record<TableName, string> = {
  contacts: "/contacts",
  companies: "/companies",
  events: "/events",
  plays: "/plays",
  artists: "/artists",
};

const LABEL: Record<TableName, string> = {
  contacts: "contact",
  companies: "venue",
  events: "event",
  plays: "play",
  artists: "artist",
};

// A "Delete" trigger + confirm modal, reused across every detail page.
// Two levels of guard depending on blast radius: a plain confirm click for
// records whose foreign keys are either safe (SET NULL) or self-blocking
// (NO ACTION -- Postgres just refuses and we surface a friendly message),
// and a stronger type-the-name confirm for records whose deletion cascades
// into other data the person might not expect to lose (an artist's plays).
export default function DeleteRecordButton({
  table,
  id,
  name,
  cascadeWarning,
}: {
  table: TableName;
  id: string;
  /** Display name shown in the confirm copy, and -- when cascadeWarning is
   * set -- the phrase that must be typed to enable the delete button. */
  name: string;
  /** Extra red-flag copy for deletes with a wider blast radius than "just
   * this record" (e.g. an artist's plays cascade-deleting with them).
   * Setting this also requires typing the record's name before the delete
   * button becomes clickable. */
  cascadeWarning?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<DeleteBlocker[]>([]);

  const label = LABEL[table];
  const needsTypedConfirm = !!cascadeWarning;
  const canConfirm = !needsTypedConfirm || confirmText.trim() === name.trim();

  function close() {
    if (submitting) return;
    setOpen(false);
    setConfirmText("");
    setError(null);
    setBlockers([]);
  }

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    setBlockers([]);
    const res = await deleteRecord(table, id);
    setSubmitting(false);

    if (res.ok) {
      router.push(LIST_ROUTE[table]);
      router.refresh();
    } else {
      setError(res.error);
      setBlockers(res.blockers ?? []);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-sm text-black/40 dark:text-white/40 hover:text-red-500 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5" />
        Delete
      </button>

      {open && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5"
          >
            <h2 className="font-display text-lg font-medium mb-2">Delete this {label}?</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              This permanently deletes{" "}
              <span className="font-medium text-black dark:text-white">{name}</span>. This
              can&apos;t be undone.
            </p>

            {cascadeWarning && (
              <p className="text-sm text-red-500 mb-3">{cascadeWarning}</p>
            )}

            {needsTypedConfirm && (
              <div className="mb-3">
                <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                  Type &quot;{name}&quot; to confirm
                </label>
                <input
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  autoFocus
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-red-400"
                />
              </div>
            )}

            {error && (
              <div className="mb-3">
                <p className="text-sm text-red-500">{error}</p>
                {blockers.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {blockers.map((b) =>
                      b.href ? (
                        <li key={b.href}>
                          <Link
                            href={b.href}
                            className="text-sm text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                          >
                            {b.label}
                          </Link>
                        </li>
                      ) : (
                        <li key={b.label} className="text-sm text-black/50 dark:text-white/50">
                          {b.label}
                        </li>
                      )
                    )}
                  </ul>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-1">
              <button
                onClick={handleDelete}
                disabled={submitting || !canConfirm}
                className="flex-1 rounded-md bg-red-600 text-white text-sm font-medium py-2 hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {submitting ? "Deleting…" : `Delete ${label}`}
              </button>
              <button
                onClick={close}
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
