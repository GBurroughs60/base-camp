"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateDisplayName } from "@/app/actions/userProfiles";
import { PencilIcon } from "./icons";

// Single-line click-to-edit field for a Base Camp account's display name
// (Settings > Team). Mirrors InlineEditField's look and interaction
// exactly (same classes, same pencil-on-hover affordance) so the two read
// as one family, but it can't reuse that component directly: InlineEditField
// always UPDATEs an existing row through the generic table/field whitelist
// (records.ts), while a user_profiles row may not exist yet for an account
// that's never set a name -- this needs an upsert (updateDisplayName,
// userProfiles.ts), which is a different write shape, not just a different
// table name.
export default function InlineDisplayNameField({
  userId,
  value,
  placeholder,
}: {
  userId: string;
  /** Current display_name, or null if never set -- render the fallback
   * (email) as placeholder text, same convention as every other empty
   * InlineEditField. */
  value: string | null;
  placeholder: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value ?? "");
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
    setDraft(current ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const trimmed = draft.trim();
    const newValue = trimmed === "" ? null : trimmed;

    if (newValue === current) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateDisplayName(userId, trimmed);
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

  const isEmpty = current == null || current === "";

  if (editing) {
    return (
      <span className="inline-flex flex-col gap-1">
        <input
          ref={inputRef}
          type="text"
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
          className="w-full min-w-0 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50"
        />
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
        {isEmpty ? placeholder : current}
      </span>
      <button
        type="button"
        onClick={beginEdit}
        aria-label="Edit display name"
        className="shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity"
      >
        <PencilIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
