"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField, type TableName } from "@/app/actions/records";
import { ChevronIcon } from "./icons";

export default function InlineSelectField({
  table,
  id,
  field,
  value,
  options,
  className,
}: {
  table: TableName;
  id: string;
  field: string;
  value: string | boolean | null;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (editing) selectRef.current?.focus();
  }, [editing]);

  const currentKey = current === null || current === undefined ? "" : String(current);
  const activeOption = options.find((o) => o.value === currentKey);

  function commit(nextKey: string) {
    // Coerce booleans back from the string keys ("true"/"false") the
    // <select> gives us if that's the type this field actually stores.
    const nextValue: string | boolean | null =
      typeof current === "boolean" ? nextKey === "true" : nextKey || null;

    if (nextValue === current) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateField(table, id, field, nextValue);
      if (res.ok) {
        setCurrent(nextValue);
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

  if (editing) {
    return (
      <span className={"inline-flex flex-col gap-1 " + (className ?? "")}>
        <select
          ref={selectRef}
          value={currentKey}
          disabled={pending}
          onChange={(e) => commit(e.target.value)}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setEditing(false);
          }}
          className="rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setEditing(true);
      }}
      className={
        "group/field inline-flex items-center gap-1 cursor-pointer rounded px-0.5 -mx-0.5 transition-colors " +
        (flash ? "text-ridge-orange-dark dark:text-ridge-orange" : "") +
        " " +
        (className ?? "")
      }
    >
      <span className={!activeOption ? "text-black/40 dark:text-white/40" : ""}>
        {activeOption?.label ?? "—"}
      </span>
      <ChevronIcon className="w-3 h-3 shrink-0 opacity-40 group-hover/field:opacity-80 transition-opacity" />
    </span>
  );
}
