"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBookingCommissionSplitPct } from "@/app/actions/userProfiles";
import { PencilIcon } from "./icons";

// Click-to-edit percentage field for a Base Camp account's booking-
// commission split (Settings > Team, docs/operations-accounting-plan.md
// section 11). Mirrors InlineDisplayNameField's shape exactly (same
// upsert-may-be-needed reasoning, same look), not a numeric
// InlineEditField against the generic table/field whitelist -- this is
// admin-gated (updateBookingCommissionSplitPct calls requireAdmin
// itself) and user_profiles-scoped, same split as updateDisplayName vs.
// InlineEditField.
export default function InlineCommissionSplitField({
  userId,
  value,
}: {
  userId: string;
  /** Whole-number percentage (50 means 50%), or null if never set --
   * rendered as a dash placeholder, never assumed to be 0. */
  value: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value != null ? String(value) : "");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function beginEdit() {
    if (pending) return;
    setDraft(current != null ? String(current) : "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : Number(trimmed);
    if (newValue !== null && Number.isNaN(newValue)) {
      setError("Enter a number.");
      return;
    }

    if (newValue === current) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateBookingCommissionSplitPct(userId, newValue);
      if (res.ok) {
        setCurrent(newValue);
        setEditing(false);
        setError(null);
        setFlash(true);
        router.refresh();
        setTimeout(() => setFlash(false), 700);
      } else {
        setError(res.error);
      }
    });
  }

  const isEmpty = current == null;

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1">
        <span className="inline-flex items-center gap-1">
          <input
            ref={inputRef}
            type="number"
            min={0}
            max={100}
            step="any"
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              } else if (e.key === "Enter") {
                e.preventDefault();
                commit();
              }
            }}
            className="w-16 min-w-0 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50"
          />
          <span className="text-black/50 dark:text-white/50">%</span>
        </span>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <span className="group/field inline-flex items-center gap-1.5">
      <span
        role="button"
        tabIndex={0}
        onClick={beginEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") beginEdit();
        }}
        className={
          "cursor-text rounded px-0.5 -mx-0.5 transition-colors " +
          (flash ? "text-ridge-orange-dark dark:text-ridge-orange" : "") +
          (isEmpty ? " text-black/40 dark:text-white/40" : "")
        }
      >
        {isEmpty ? "No rate set" : `${current}%`}
      </span>
      <button
        type="button"
        onClick={beginEdit}
        aria-label="Edit commission split"
        className="shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity"
      >
        <PencilIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
