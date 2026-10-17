"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { completeActionItem, dismissActionItem, type DismissTarget } from "@/app/actions/actionItems";
import { listActiveArtists } from "@/app/actions/records";

const DISMISS_PRESETS: { label: string; days: number }[] = [
  { label: "Next week", days: 7 },
  { label: "Next month", days: 30 },
  { label: "90 days", days: 90 },
  { label: "180 days", days: 180 },
  { label: "Next year", days: 365 },
];

// Mark complete / Dismiss for one Action List row -- shared across "auto"
// (event-linked) and "manual" (freeform task) rows alike, per
// docs/outreach-engine-plan.md section 2a. The only behavioral difference
// is the optional artist picker next to Mark complete, which only makes
// sense for an auto row (it feeds the outreach_log write that row's
// completion triggers -- a manual task never writes to outreach_log).
export default function ActionItemRowActions({ id, isAuto }: { id: string; isAuto: boolean }) {
  const router = useRouter();
  const wrapRef = useRef<HTMLDivElement>(null);

  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [showArtistPick, setShowArtistPick] = useState(false);
  const [artists, setArtists] = useState<{ id: string; name: string }[]>([]);
  const [artistId, setArtistId] = useState<string>("");

  const [dismissOpen, setDismissOpen] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [dismissError, setDismissError] = useState<string | null>(null);
  const [dismissNote, setDismissNote] = useState<string | null>(null);
  const [customDate, setCustomDate] = useState("");

  useEffect(() => {
    if (!dismissOpen && !showArtistPick) return;
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setDismissOpen(false);
        setShowArtistPick(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dismissOpen, showArtistPick]);

  async function runComplete(withArtistId: string | null) {
    setCompleting(true);
    setCompleteError(null);
    const res = await completeActionItem(id, withArtistId);
    setCompleting(false);
    if (!res.ok) {
      setCompleteError(res.error);
      return;
    }
    router.refresh();
  }

  async function openArtistPick() {
    if (!isAuto) {
      runComplete(null);
      return;
    }
    if (artists.length === 0) {
      const list = await listActiveArtists();
      setArtists(list);
    }
    setShowArtistPick(true);
  }

  async function runDismiss(target: DismissTarget) {
    setDismissing(true);
    setDismissError(null);
    setDismissNote(null);
    const res = await dismissActionItem(id, target);
    setDismissing(false);
    if (!res.ok) {
      setDismissError(res.error);
      return;
    }
    if (res.capped) {
      setDismissNote(res.capReason);
      // Let Greg see why before the row disappears from the list on refresh.
      setTimeout(() => router.refresh(), 1800);
    } else {
      setDismissOpen(false);
      router.refresh();
    }
  }

  return (
    <div className="relative flex items-center gap-2" ref={wrapRef}>
      <button
        type="button"
        onClick={openArtistPick}
        disabled={completing}
        className="rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {completing ? "Saving…" : "Mark complete"}
      </button>

      <button
        type="button"
        onClick={() => setDismissOpen((v) => !v)}
        disabled={dismissing}
        className="text-xs text-black/50 dark:text-white/50 hover:underline underline-offset-4 disabled:opacity-50 whitespace-nowrap"
      >
        Dismiss
      </button>

      {completeError && <p className="text-red-500 text-xs">{completeError}</p>}

      {showArtistPick && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg p-3 space-y-2">
          <p className="text-xs text-black/60 dark:text-white/60">
            Who did you pitch? Optional — leave blank if you haven&apos;t settled on an artist yet.
          </p>
          <select
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
          >
            <option value="">No artist yet</option>
            {artists.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setShowArtistPick(false);
                runComplete(artistId || null);
              }}
              className="flex-1 rounded bg-ridge-orange text-white text-sm py-1"
            >
              Mark complete
            </button>
            <button
              type="button"
              onClick={() => setShowArtistPick(false)}
              className="rounded border border-black/15 dark:border-white/15 text-sm px-2 py-1"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {dismissOpen && (
        <div className="absolute right-0 top-full z-30 mt-1 w-56 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg py-1">
          {DISMISS_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => runDismiss({ kind: "preset", days: p.days })}
              disabled={dismissing}
              className="w-full text-left px-3 py-2 text-sm text-black/70 dark:text-white/70 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
          <div className="border-t border-black/10 dark:border-white/10 px-3 py-2 space-y-1.5">
            <label className="block text-xs text-black/50 dark:text-white/50">Or pick a date</label>
            <div className="flex gap-1.5">
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                className="flex-1 min-w-0 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-xs outline-none focus:border-ridge-orange"
              />
              <button
                type="button"
                onClick={() => customDate && runDismiss({ kind: "custom", date: customDate })}
                disabled={dismissing || !customDate}
                className="rounded bg-ridge-orange text-white text-xs px-2 py-1 disabled:opacity-50"
              >
                Go
              </button>
            </div>
          </div>
          {dismissError && <p className="px-3 py-1 text-xs text-red-500">{dismissError}</p>}
          {dismissNote && <p className="px-3 py-2 text-xs text-black/60 dark:text-white/60">{dismissNote}</p>}
        </div>
      )}
    </div>
  );
}
