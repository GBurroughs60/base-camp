"use client";

import { useMemo, useState } from "react";
import PendingReviewRowActions from "./inline/PendingReviewRowActions";
import CopyButton from "./inline/CopyButton";
import { SearchIcon } from "./inline/icons";

export type PendingReviewRow = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
};

// One shared grid, not one grid per row -- same reasoning as
// CandidatesList.tsx's GRID_COLS: a separate grid per row resolves its own
// fr tracks independently and the header drifts out of alignment with the
// data below it.
const GRID_COLS = "grid-cols-[minmax(220px,1.6fr)_minmax(140px,1fr)_minmax(220px,1.2fr)_auto]";

function locationLabel(city: string | null, state: string | null): string {
  return [city, state].filter(Boolean).join(", ") || "Location unknown";
}

export default function PendingReviewList({ rows }: { rows: PendingReviewRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.city, r.state, r.id].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      <div className="relative max-w-md mb-4">
        <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search pending events..."
          className="w-full rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm outline-none focus:border-ridge-orange transition-colors"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="p-6 text-sm text-black/60 dark:text-white/60 border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
          {rows.length ? "No matches." : "Nothing is waiting on Pending Review right now."}
        </p>
      ) : (
        <div
          className={`grid ${GRID_COLS} border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900 overflow-x-auto`}
        >
          {(["Event", "Location", "Event ID", ""] as const).map((label, i) => (
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
                  {/* block, not a bare inline span -- a plain inline child
                      of a block div is never width-constrained, so
                      truncate's overflow:hidden has nothing to clip
                      against and a long name overflows into the next
                      column instead of eliding. (The Event ID cell below
                      doesn't need this: its truncating span is a flex
                      item of an inner flex row, which blockifies it
                      automatically.) */}
                  <span className="block truncate font-medium">{r.name}</span>
                </div>

                <div className={`min-w-0 px-4 py-3 text-sm text-black/70 dark:text-white/70 ${rowBorder}`}>
                  {locationLabel(r.city, r.state)}
                </div>

                <div className={`min-w-0 px-4 py-3 ${rowBorder}`}>
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate font-mono text-xs text-black/50 dark:text-white/50">
                      {r.id}
                    </span>
                    <CopyButton value={r.id} label="Copy event ID" />
                  </span>
                </div>

                <div className={`px-4 py-3 ${rowBorder}`}>
                  <PendingReviewRowActions
                    eventId={r.id}
                    name={r.name}
                    city={r.city}
                    state={r.state}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
