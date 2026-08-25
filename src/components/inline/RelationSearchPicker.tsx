"use client";

import { useEffect, useRef, useState } from "react";
import {
  createRecord,
  searchRecords,
  type SearchTable,
} from "@/app/actions/records";
import { SearchIcon } from "./icons";

const COMPANY_TYPES = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "agency", label: "Agency" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

const RELATED_LABEL: Record<SearchTable, string> = {
  companies: "Venue",
  events: "Event",
  contacts: "Contact",
};

// A small popover: search existing records of `table`, or fall back to
// creating a brand-new one with just its essential fields when nothing
// matches. Used both to edit an existing record's link (InlineRelationField)
// and inside quick-create forms (e.g. picking/creating a Play's venue)
// where there's no parent record id to write to yet -- either way this
// component only ever resolves to a chosen {id, label} via onSelect.
export default function RelationSearchPicker({
  table,
  onSelect,
}: {
  table: SearchTable;
  onSelect: (id: string, label: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; label: string; sublabel: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("venue");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchRecords(table, query);
      if (!cancelled) {
        setResults(rows);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [table, query]);

  useEffect(() => {
    setNewName(query);
    setNewEmail("");
    setNewPhone("");
  }, [showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const data: Record<string, unknown> =
      table === "contacts"
        ? { full_name: newName, email: newEmail || null, phone: newPhone || null }
        : table === "companies"
          ? { name: newName, type: newType, city: newCity || null, state: newState || null }
          : { name: newName };

    const res = await createRecord(table, data);
    setCreating(false);
    if (res.ok) {
      onSelect(res.data.id, newName);
    } else {
      setCreateError(res.error);
    }
  }

  const label = RELATED_LABEL[table];

  return (
    <div className="w-64">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/10 dark:border-white/10">
        <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowCreate(false);
          }}
          placeholder={`Search ${label.toLowerCase()}s...`}
          className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
        />
      </div>

      {!showCreate && (
        <>
          <ul className="max-h-48 overflow-y-auto py-1">
            {loading && (
              <li className="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">
                Searching…
              </li>
            )}
            {!loading && results.length === 0 && (
              <li className="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">
                No matches
              </li>
            )}
            {!loading &&
              results.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => onSelect(r.id, r.label)}
                    className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    {r.label}
                    {r.sublabel && (
                      <span className="text-black/40 dark:text-white/40">
                        {" "}
                        · {r.sublabel}
                      </span>
                    )}
                  </button>
                </li>
              ))}
          </ul>
          <button
            onClick={() => setShowCreate(true)}
            className="w-full text-left px-3 py-2 text-sm text-ridge-orange-dark dark:text-ridge-orange border-t border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            + Create new {label.toLowerCase()}
          </button>
        </>
      )}

      {showCreate && (
        <div className="p-3 space-y-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={table === "contacts" ? "Full name" : "Name"}
            className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
          />
          {table === "contacts" && (
            <div className="flex gap-2">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Email (optional)"
                className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
              />
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Phone (optional)"
                className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
              />
            </div>
          )}
          {table === "companies" && (
            <>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
              >
                {COMPANY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <input
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="City"
                  className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                />
                <input
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  placeholder="State"
                  className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                />
              </div>
            </>
          )}
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex-1 rounded bg-ridge-orange text-white text-sm py-1 disabled:opacity-50"
            >
              {creating ? "Creating…" : `Create ${label}`}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="rounded border border-black/15 dark:border-white/15 text-sm px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
