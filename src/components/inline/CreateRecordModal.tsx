"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRecord,
  fuzzyMatchCompanies,
  type TableName,
  type CompanyFuzzyMatch,
} from "@/app/actions/records";

const ROUTE: Record<TableName, string> = {
  contacts: "/contacts",
  companies: "/companies",
  events: "/events",
  plays: "/plays",
  artists: "/artists",
  // Not reachable -- this modal is never opened for candidates (they're
  // only ever created by the scan cron), but TableName must be exhaustive.
  candidates: "/candidates",
};

const TITLE: Record<TableName, string> = {
  contacts: "New Contact",
  companies: "New Venue",
  events: "New Event",
  plays: "New Play",
  artists: "New Artist",
  candidates: "New Candidate",
};

const COMPANY_TYPES = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "agency", label: "Agency" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

// Handles contacts/companies/events/artists. Plays are deliberately excluded
// -- see NewPlayModal.tsx, which NewRecordButton opens instead for the
// full-scope internal "New Play" flow (section-card layout mirroring the
// public /book form, search-first venue/event/contact pickers). Keeping
// that entirely separate rather than special-cased in here avoids two
// half-overlapping implementations of "create a play" drifting apart.
export default function CreateRecordModal({
  table,
  onClose,
}: {
  table: Exclude<TableName, "plays">;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("venue");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fuzzyMatches, setFuzzyMatches] = useState<CompanyFuzzyMatch[]>([]);

  const nameLabel = table === "contacts" ? "Full name" : "Name";

  // Same "did you mean" nudge as RelationSearchPicker's quick-create, for
  // this modal's own top-level company form (the Companies page's "+ New
  // Venue" flow, as opposed to picking/creating a venue inline on a Play).
  useEffect(() => {
    if (table !== "companies") {
      setFuzzyMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const matches = await fuzzyMatchCompanies(name);
      if (!cancelled) setFuzzyMatches(matches);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [table, name]);

  async function handleSubmit() {
    setError(null);

    if (!name.trim()) {
      setError(`${nameLabel} is required`);
      return;
    }
    // Website drives domain-based candidate matching in the weekly scan --
    // a venue created without one is invisible to that matching, so it's
    // required here rather than left optional like city/state.
    if (table === "companies" && !website.trim()) {
      setError("Website is required");
      return;
    }

    const data: Record<string, unknown> =
      table === "contacts"
        ? { full_name: name, email: email || null, phone: phone || null }
        : table === "companies"
          ? { name, type, city: city || null, state: state || null, website: website || null }
          : table === "events"
            ? { name, city: city || null, state: state || null }
            : table === "artists"
              ? { name }
              : // Unreachable -- this modal is never opened for
                // candidates (see the ROUTE/TITLE comment above).
                {};

    setSubmitting(true);
    const res = await createRecord(table, data);
    setSubmitting(false);

    if (res.ok) {
      router.push(`${ROUTE[table]}/${res.data.id}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5"
      >
        <h2 className="font-display text-lg font-medium mb-4">{TITLE[table]}</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
              {nameLabel}
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
            />
          </div>
          {table === "contacts" && (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange placeholder:text-black/30 dark:placeholder:text-white/30"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange placeholder:text-black/30 dark:placeholder:text-white/30"
                    />
                  </div>
                </div>
              )}
              {table === "companies" && (
                <div>
                  <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                  >
                    {COMPANY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {table === "companies" && (
                <div>
                  <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                    Website
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://..."
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange placeholder:text-black/30 dark:placeholder:text-white/30"
                  />
                </div>
              )}
              {(table === "companies" || table === "events") && (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      City
                    </label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      State
                    </label>
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                    />
                  </div>
            </div>
          )}

          {table === "companies" && fuzzyMatches.length > 0 && (
            <div className="rounded border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-2 space-y-1">
              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                Possible existing match — open it instead of creating a duplicate:
              </p>
              {fuzzyMatches.map((m) => (
                <button
                  key={m.id}
                  onClick={() => {
                    onClose();
                    router.push(`/companies/${m.id}`);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-sm bg-white dark:bg-neutral-900 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {m.name}
                  {(m.city || m.state) && (
                    <span className="text-black/40 dark:text-white/40">
                      {" "}
                      · {[m.city, m.state].filter(Boolean).join(", ")}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : `Create ${TITLE[table].replace("New ", "")}`}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
