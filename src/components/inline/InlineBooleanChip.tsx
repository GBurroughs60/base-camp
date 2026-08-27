"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField, type TableName } from "@/app/actions/records";

// A click-to-toggle pill for an independent boolean flag, styled to match
// the Active/Archived-style filter pills used on the list pages. Unlike
// InlineSelectField (one value chosen from a set of options), this is meant
// to be used in small groups of chips that can each be on or off on their
// own -- e.g. a venue being both indoor and outdoor at once.
export default function InlineBooleanChip({
  table,
  id,
  field,
  value,
  label,
}: {
  table: TableName;
  id: string;
  field: string;
  value: boolean;
  label: string;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [pending, startTransition] = useTransition();

  function toggle() {
    if (pending) return;
    const next = !current;
    startTransition(async () => {
      const res = await updateField(table, id, field, next);
      if (res.ok) {
        setCurrent(next);
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={current}
      className={`px-3 py-1 text-sm rounded-full border transition-colors disabled:opacity-50 ${
        current
          ? "bg-ridge-orange text-white border-transparent"
          : "border-black/15 dark:border-white/15 text-black/50 dark:text-white/50 hover:border-ridge-orange/50"
      }`}
    >
      {label}
    </button>
  );
}
