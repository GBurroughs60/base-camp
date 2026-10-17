"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createManualTask, searchLinkableRecords, type LinkableKind } from "@/app/actions/actionItems";
import { SearchIcon } from "./inline/icons";

const LINK_KINDS: { value: LinkableKind; label: string }[] = [
  { value: "event", label: "Event" },
  { value: "company", label: "Venue / Company" },
  { value: "contact", label: "Contact" },
  { value: "artist", label: "Artist" },
];

// The HubSpot-style "+ New Task" escape hatch for the Action List -- a
// freeform task Greg creates himself, optionally linked to one existing
// record for context. See docs/outreach-engine-plan.md section 2a,
// "Custom tasks."
export default function NewTaskModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [linkKind, setLinkKind] = useState<LinkableKind | "">("");
  const [linkQuery, setLinkQuery] = useState("");
  const [linkResults, setLinkResults] = useState<{ id: string; label: string; sublabel: string | null }[]>([]);
  const [linkSelected, setLinkSelected] = useState<{ id: string; label: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!linkKind || linkSelected) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const rows = await searchLinkableRecords(linkKind, linkQuery);
      if (!cancelled) setLinkResults(rows);
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [linkKind, linkQuery, linkSelected]);

  async function handleSave() {
    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    setSaving(true);
    setError(null);
    const res = await createManualTask({
      title,
      notes: notes || null,
      dueDate: dueDate || null,
      eventId: linkKind === "event" ? (linkSelected?.id ?? null) : null,
      companyId: linkKind === "company" ? (linkSelected?.id ?? null) : null,
      contactId: linkKind === "contact" ? (linkSelected?.id ?? null) : null,
      artistId: linkKind === "artist" ? (linkSelected?.id ?? null) : null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5 space-y-3"
      >
        <h2 className="font-display text-lg font-medium">New task</h2>

        <input
          ref={titleRef}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Confirm Brittany's availability before pitching"
          className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-ridge-orange"
        />

        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Notes (optional)"
          rows={2}
          className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-ridge-orange resize-none"
        />

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Due date (optional — leave blank to show up right away)
          </label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-ridge-orange"
          />
        </div>

        <div>
          <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
            Link to a record (optional)
          </label>
          {!linkKind ? (
            <div className="flex flex-wrap gap-1.5">
              {LINK_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setLinkKind(k.value)}
                  className="rounded-full border border-black/15 dark:border-white/15 px-2.5 py-1 text-xs text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  {k.label}
                </button>
              ))}
            </div>
          ) : linkSelected ? (
            <div className="flex items-center justify-between rounded border border-black/15 dark:border-white/15 px-3 py-2 text-sm">
              <span>{linkSelected.label}</span>
              <button
                type="button"
                onClick={() => {
                  setLinkSelected(null);
                  setLinkKind("");
                  setLinkQuery("");
                }}
                className="text-xs text-black/50 dark:text-white/50 hover:underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <div className="rounded border border-black/15 dark:border-white/15">
              <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/10 dark:border-white/10">
                <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 shrink-0" />
                <input
                  autoFocus
                  value={linkQuery}
                  onChange={(e) => setLinkQuery(e.target.value)}
                  placeholder={`Search ${LINK_KINDS.find((k) => k.value === linkKind)?.label.toLowerCase()}...`}
                  className="flex-1 min-w-0 bg-transparent text-sm outline-none"
                />
                <button
                  type="button"
                  onClick={() => setLinkKind("")}
                  className="text-xs text-black/40 dark:text-white/40 hover:text-black dark:hover:text-white"
                >
                  ✕
                </button>
              </div>
              <ul className="max-h-36 overflow-y-auto py-1">
                {linkResults.length === 0 && (
                  <li className="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">No matches</li>
                )}
                {linkResults.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setLinkSelected({ id: r.id, label: r.label })}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      {r.label}
                      {r.sublabel && (
                        <span className="text-black/40 dark:text-white/40"> · {r.sublabel}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create task"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
