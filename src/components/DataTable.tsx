"use client";

import { useMemo, useState } from "react";
import { SearchIcon } from "./inline/icons";

export type Column<T> = {
  key: string;
  label: string;
  render: (row: T) => React.ReactNode;
  /** Value used for sorting when this column's header is clicked. Omit for
   * a column that shouldn't be sortable (e.g. a "Linked to" summary). */
  sortValue?: (row: T) => string | number | null;
  /** Value(s) matched against the search box, lowercased. Omit to exclude
   * this column from search entirely. */
  searchValue?: (row: T) => string;
  align?: "left" | "right";
};

function SortIndicator({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <span
      className={
        "text-[9px] leading-none " +
        (active
          ? "text-ridge-orange-dark dark:text-ridge-orange"
          : "text-black/25 dark:text-white/25")
      }
    >
      {active ? (dir === "asc" ? "▲" : "▼") : "↕"}
    </span>
  );
}

// A client-side searchable, sortable table. Row counts here (a few hundred
// at most) are small enough that filtering/sorting in the browser against
// already-fetched data is instant and needs no server round-trip -- this
// is a spreadsheet-style filter over what's on screen, not a database query.
export default function DataTable<T extends { id: string }>({
  rows,
  columns,
  searchPlaceholder = "Search...",
  emptyMessage = "Nothing here yet.",
  defaultSortKey,
  defaultSortDir = "asc",
}: {
  rows: T[];
  columns: Column<T>[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
}) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<string | undefined>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(defaultSortDir);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      columns.some((c) => c.searchValue?.(row)?.toLowerCase().includes(q))
    );
  }, [rows, query, columns]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    const withKeys = filtered.map((row) => ({ row, v: col.sortValue!(row) }));
    withKeys.sort((a, b) => {
      if (a.v === null || a.v === undefined) return 1;
      if (b.v === null || b.v === undefined) return -1;
      if (typeof a.v === "number" && typeof b.v === "number") return a.v - b.v;
      return String(a.v).localeCompare(String(b.v), undefined, { numeric: true });
    });
    const ordered = withKeys.map((x) => x.row);
    return sortDir === "desc" ? ordered.reverse() : ordered;
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  return (
    <div>
      <div className="flex justify-center mb-4">
        <div className="relative w-full max-w-md">
          <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm outline-none focus:border-ridge-orange transition-colors"
          />
        </div>
      </div>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  className={
                    "px-4 py-2 font-medium " + (c.align === "right" ? "text-right" : "")
                  }
                >
                  {c.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      {c.label}
                      <SortIndicator active={sortKey === c.key} dir={sortDir} />
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
              >
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={"px-4 py-2 " + (c.align === "right" ? "text-right" : "")}
                  >
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!sorted.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            {rows.length ? "No matches." : emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}
