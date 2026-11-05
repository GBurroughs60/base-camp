"use client";

import { useState } from "react";
import { ChevronIcon } from "./icons";

// Generic collapsed-by-default section used for an event's Outreach
// History and Research Log (2026-11-05, per Greg -- the event page was
// "a bit cluttered and messy" with everything always expanded; a running
// history is worth keeping but doesn't need to compete with the fields
// someone actually came to the page to see). Starts closed; the summary
// line is always visible so there's still a one-glance signal (count,
// last-activity date) without opening it.
export default function CollapsibleSection({
  summary,
  defaultOpen = false,
  children,
}: {
  summary: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-3.5 text-sm text-black/60 dark:text-white/60 hover:text-black/80 dark:hover:text-white/80 transition-colors"
      >
        <span>{summary}</span>
        <ChevronIcon
          className={`w-3 h-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="px-5 pb-4 text-sm text-black/70 dark:text-white/70 space-y-3 border-t border-black/10 dark:border-white/10 pt-3">
          {children}
        </div>
      )}
    </div>
  );
}
