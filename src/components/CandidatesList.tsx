"use client";

import { useMemo, useState } from "react";
import InlineEditField from "./inline/InlineEditField";
import InlineRelationField from "./inline/InlineRelationField";
import CandidateRowActions from "./inline/CandidateRowActions";
import { SearchIcon } from "./inline/icons";

export type CandidateListRow = {
  id: string;
  email: string;
  inferred_name: string | null;
  inferred_phone: string | null;
  matched_company_id: string | null;
  companyLabel: string | null;
  matched_event_id: string | null;
  eventLabel: string | null;
  subject: string | null;
  bodySnippet: string | null;
};

// Shared column template applied to both the header and every row, via
// CSS grid rather than a real <table>/<td>. A <table> was the original
// build here, and it broke in a way that isn't easily patched: the
// InlineRelationField/RelationSearchPicker dropdown is an absolutely
// positioned popover, and an ancestor <td>/<table> combined with
// DataTable's own overflow-x-auto wrapper clips and z-index-fights any
// popover that tries to escape it -- so the "add a venue" search box came
// out half-hidden behind neighboring cells, and on a row near the bottom
// of the table the Add/Dismiss actions column could end up past whatever
// the wrapper's clipped bounds were, with no way to reach it. Plain
// sibling divs with no clipping ancestor don't have either problem: a
// popover just renders on top of whatever's below it and the page scrolls
// normally past the wrapper's edge.
const GRID_COLS =
  "grid gap-3 items-center " +
  "[grid-template-columns:minmax(200px,1.4fr)_minmax(140px,1fr)_minmax(170px,1.1fr)_minmax(150px,1fr)_minmax(120px,0.9fr)_auto]";

export default function CandidatesList({ rows }: { rows: CandidateListRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.email, r.inferred_name, r.companyLabel, r.eventLabel, r.inferred_phone, r.subject]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [rows, query]);

  return (
    <div>
      <div className="relative max-w-md mb-4">
        <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search candidates..."
          className="w-full rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm outline-none focus:border-ridge-orange transition-colors"
        />
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900 overflow-visible">
        <div
          className={`${GRID_COLS} px-4 py-2 text-xs font-medium text-black/50 dark:text-white/50 bg-black/[.03] dark:bg-white/[.06] rounded-t-lg`}
        >
          <span>Email</span>
          <span>Name</span>
          <span>Company / Venue</span>
          <span>Event</span>
          <span>Phone</span>
          <span />
        </div>

        {filtered.length === 0 && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            {rows.length ? "No matches." : "No new candidates right now -- check back after the next weekly scan."}
          </p>
        )}

        <div className="divide-y divide-black/10 dark:divide-white/10">
          {filtered.map((c) => {
            const context = [c.subject, c.bodySnippet].filter(Boolean).join(" — ") || undefined;
            return (
              <div key={c.id} className={`${GRID_COLS} px-4 py-3`}>
                <div className="min-w-0">
                  <a
                    href={`mailto:${c.email}`}
                    className="block truncate text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {c.email}
                  </a>
                  {c.subject && (
                    <p
                      title={context}
                      className="mt-0.5 truncate text-xs text-black/40 dark:text-white/40"
                    >
                      {c.subject}
                    </p>
                  )}
                </div>

                <div className="min-w-0">
                  <InlineEditField
                    table="candidates"
                    id={c.id}
                    field="inferred_name"
                    value={c.inferred_name}
                    placeholder="Add name"
                  />
                </div>

                <div className="min-w-0">
                  <InlineRelationField
                    table="candidates"
                    id={c.id}
                    field="matched_company_id"
                    relatedTable="companies"
                    value={
                      c.matched_company_id
                        ? { id: c.matched_company_id, label: c.companyLabel ?? "Unknown" }
                        : null
                    }
                    placeholder="Add venue"
                  />
                </div>

                <div className="min-w-0">
                  <InlineRelationField
                    table="candidates"
                    id={c.id}
                    field="matched_event_id"
                    relatedTable="events"
                    value={
                      c.matched_event_id
                        ? { id: c.matched_event_id, label: c.eventLabel ?? "Unknown" }
                        : null
                    }
                    placeholder="Add event"
                  />
                </div>

                <div className="min-w-0">
                  <InlineEditField
                    table="candidates"
                    id={c.id}
                    field="inferred_phone"
                    value={c.inferred_phone}
                    placeholder="Add phone"
                  />
                </div>

                <div>
                  <CandidateRowActions
                    candidateId={c.id}
                    name={c.inferred_name}
                    email={c.email}
                    phone={c.inferred_phone}
                    companyId={c.matched_company_id}
                    eventId={c.matched_event_id}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
