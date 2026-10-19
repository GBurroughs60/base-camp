"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ActionItemRowActions from "./inline/ActionItemRowActions";
import NewTaskModal from "./NewTaskModal";
import CopyButton from "./inline/CopyButton";
import { SearchIcon } from "./inline/icons";

export type ActionItemRow = {
  id: string;
  source: "auto" | "manual";
  sortDate: string;
  // auto (event-linked) fields
  eventId: string | null;
  eventName: string | null;
  occurrenceDate: string | null;
  venueLabel: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  sourceLink: string | null;
  // manual (task) fields
  title: string | null;
  dueDate: string | null;
  notes: string | null;
  linkedLabel: string | null;
  linkedHref: string | null;
};

function formatDate(iso: string | null): string {
  if (!iso) return "No date";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const GRID_COLS = "grid-cols-[minmax(220px,1.6fr)_minmax(180px,1.2fr)_minmax(180px,1.1fr)_minmax(90px,0.6fr)_auto]";

export default function ActionItemsList({ rows }: { rows: ActionItemRow[] }) {
  const [query, setQuery] = useState("");
  const [showNewTask, setShowNewTask] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.eventName, r.title, r.venueLabel, r.contactEmail, r.linkedLabel, r.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="relative max-w-md flex-1">
          <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the action list..."
            className="w-full rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm outline-none focus:border-ridge-orange transition-colors"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowNewTask(true)}
          className="rounded-md bg-ridge-orange text-white text-sm font-medium px-3 py-2 hover:bg-ridge-orange-dark transition-colors whitespace-nowrap"
        >
          + New Task
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-black/60 dark:text-white/60 border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
          {rows.length
            ? "No matches."
            : "Nothing to work right now — check back after tomorrow's refresh, or add a task yourself."}
        </p>
      ) : (
        <div
          className={`grid ${GRID_COLS} border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900 overflow-x-auto`}
        >
          {(["Event / Task", "Venue / Linked to", "Contact", "Date", ""] as const).map((label, i) => (
            <div
              key={label || `h-${i}`}
              className="px-4 py-2 text-xs font-medium text-black/50 dark:text-white/50 bg-black/[.03] dark:bg-white/[.06]"
            >
              {label}
            </div>
          ))}

          {filtered.map((r, rowIndex) => {
            const rowBorder = rowIndex > 0 ? "border-t border-black/10 dark:border-white/10" : "";
            return (
              <div key={r.id} className="contents">
                <div className={`min-w-0 px-4 py-3 ${rowBorder}`}>
                  {r.source === "auto" ? (
                    <Link
                      href={`/events/${r.eventId}`}
                      className="text-sm font-medium hover:underline underline-offset-4"
                    >
                      {r.eventName ?? "Untitled event"}
                    </Link>
                  ) : (
                    <p className="text-sm font-medium">{r.title}</p>
                  )}
                  {r.source === "auto" && r.sourceLink && (
                    <a
                      href={r.sourceLink}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4 mt-0.5"
                    >
                      Source page ↗
                    </a>
                  )}
                  {r.source === "manual" && r.notes && (
                    <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">{r.notes}</p>
                  )}
                </div>

                <div className={`min-w-0 px-4 py-3 ${rowBorder} text-sm text-black/70 dark:text-white/70`}>
                  {r.source === "auto"
                    ? (r.venueLabel ?? "—")
                    : r.linkedHref
                      ? (
                          <Link href={r.linkedHref} className="hover:underline underline-offset-4">
                            {r.linkedLabel}
                          </Link>
                        )
                      : "—"}
                </div>

                <div className={`min-w-0 px-4 py-3 ${rowBorder} text-sm text-black/70 dark:text-white/70`}>
                  {r.source === "auto" ? (
                    <>
                      {r.contactEmail && (
                        <span className="flex items-center gap-1.5 min-w-0">
                          <a
                            href={`mailto:${r.contactEmail}`}
                            className="hover:underline underline-offset-4 truncate"
                          >
                            {r.contactEmail}
                          </a>
                          <CopyButton value={r.contactEmail} />
                        </span>
                      )}
                      {r.contactPhone && <span className="block text-black/50 dark:text-white/50">{r.contactPhone}</span>}
                      {!r.contactEmail && !r.contactPhone && "—"}
                    </>
                  ) : (
                    "—"
                  )}
                </div>

                <div className={`px-4 py-3 ${rowBorder} text-xs text-black/50 dark:text-white/50 whitespace-nowrap`}>
                  {formatDate(r.source === "auto" ? r.occurrenceDate : r.dueDate)}
                </div>

                <div className={`px-4 py-3 ${rowBorder}`}>
                  <ActionItemRowActions id={r.id} isAuto={r.source === "auto"} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showNewTask && <NewTaskModal onClose={() => setShowNewTask(false)} />}
    </div>
  );
}
