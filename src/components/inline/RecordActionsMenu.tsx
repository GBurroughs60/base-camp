"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  deleteRecord,
  updateField,
  type DeleteBlocker,
  type TableName,
} from "@/app/actions/records";
import { MoreIcon } from "./icons";

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

function MenuItem({
  onClick,
  danger,
  disabled,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left px-3 py-2 text-sm transition-colors disabled:opacity-50 ${
        danger
          ? "text-red-500 hover:bg-red-500/10"
          : "text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5"
      }`}
    >
      {children}
    </button>
  );
}

// One "⋮" trigger per detail page, replacing what used to be two separate
// buttons (ArchiveArtistButton, DeleteRecordButton) competing for the same
// corner of the header. Which actions appear is driven entirely by props:
// pass `archived` (even `false`) to turn on Archive/Restore for tables that
// have the column -- currently artists, companies, and events -- or omit it
// entirely for contacts/plays, which have no archived column and only ever
// show Delete. `hideDelete` keeps artists archive-only: a hard delete there
// still cascades away every one of that artist's plays (see the comment on
// deleteRecord in records.ts), so it's deliberately not offered here even
// though the menu plumbing would support it.
export default function RecordActionsMenu({
  table,
  id,
  name,
  archived,
  archiveNote,
  hideDelete,
}: {
  table: TableName;
  id: string;
  name: string;
  /** Presence (not truthiness) of this prop turns on Archive/Restore. */
  archived?: boolean;
  /** Extra clause appended to the archive-confirm copy, e.g. naming what
   * stays untouched ("the 3 events and 40 plays booked here stay exactly
   * as they are"). */
  archiveNote?: string;
  hideDelete?: boolean;
}) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<"archive" | "delete" | null>(null);

  const [restoring, setRestoring] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<DeleteBlocker[]>([]);

  const label = LABEL[table];
  const showArchive = archived !== undefined;

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function closeModal() {
    if (archiving || deleting) return;
    setModal(null);
    setArchiveError(null);
    setDeleteError(null);
    setBlockers([]);
  }

  async function handleRestore() {
    setMenuOpen(false);
    setRestoring(true);
    const res = await updateField(table, id, "archived", false);
    setRestoring(false);
    if (res.ok) router.refresh();
  }

  async function handleArchive() {
    setArchiving(true);
    setArchiveError(null);
    const res = await updateField(table, id, "archived", true);
    setArchiving(false);
    if (res.ok) {
      closeModal();
      router.refresh();
    } else {
      setArchiveError(res.error);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError(null);
    setBlockers([]);
    const res = await deleteRecord(table, id);
    setDeleting(false);
    if (res.ok) {
      router.push(LIST_ROUTE[table]);
      router.refresh();
    } else {
      setDeleteError(res.error);
      setBlockers(res.blockers ?? []);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="Record actions"
        className="p-1.5 rounded-md text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <MoreIcon className="w-4 h-4" />
      </button>

      {menuOpen && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-44 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg py-1"
        >
          {showArchive &&
            (archived ? (
              <MenuItem onClick={handleRestore} disabled={restoring}>
                {restoring ? "Restoring…" : "Restore"}
              </MenuItem>
            ) : (
              <MenuItem
                onClick={() => {
                  setMenuOpen(false);
                  setModal("archive");
                }}
              >
                Archive…
              </MenuItem>
            ))}
          {!hideDelete && (
            <MenuItem
              danger
              onClick={() => {
                setMenuOpen(false);
                setModal("delete");
              }}
            >
              Delete…
            </MenuItem>
          )}
        </div>
      )}

      {modal === "archive" && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={closeModal}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5"
          >
            <h2 className="font-display text-lg font-medium mb-2">Archive this {label}?</h2>
            <p className="text-sm text-black/60 dark:text-white/60 mb-3">
              It&apos;ll be hidden from the {label} list and any pickers, but nothing is
              deleted{archiveNote ? ` — ${archiveNote}` : ""}. You can restore it from this
              same menu anytime.
            </p>

            {archiveError && <p className="text-sm text-red-500 mb-3">{archiveError}</p>}

            <div className="flex gap-2">
              <button
                onClick={handleArchive}
                disabled={archiving}
                className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
              >
                {archiving ? "Archiving…" : `Archive ${label}`}
              </button>
              <button
                onClick={closeModal}
                disabled={archiving}
                className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "delete" && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
          onClick={closeModal}
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

            {deleteError && (
              <div className="mb-3">
                <p className="text-sm text-red-500">{deleteError}</p>
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

            <div className="flex gap-2">
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-md bg-red-600 text-white text-sm font-medium py-2 hover:bg-red-700 transition-colors disabled:opacity-40"
              >
                {deleting ? "Deleting…" : `Delete ${label}`}
              </button>
              <button
                onClick={closeModal}
                disabled={deleting}
                className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
