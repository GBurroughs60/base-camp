"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateField,
  type TableName,
  type SearchTable,
} from "@/app/actions/records";
import RelationSearchPicker from "./RelationSearchPicker";
import { ChevronIcon } from "./icons";

const HREF_BASE: Record<SearchTable, string> = {
  companies: "/companies",
  events: "/events",
  contacts: "/contacts",
};

export default function InlineRelationField({
  table,
  id,
  field,
  relatedTable,
  value,
  placeholder,
  className,
}: {
  table: TableName;
  id: string;
  field: string;
  relatedTable: SearchTable;
  value: { id: string; label: string } | null;
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function handleSelect(newId: string, label: string) {
    startTransition(async () => {
      const res = await updateField(table, id, field, newId);
      if (res.ok) {
        setCurrent({ id: newId, label });
        setOpen(false);
        router.refresh();
      }
    });
  }

  function handleClear() {
    startTransition(async () => {
      const res = await updateField(table, id, field, null);
      if (res.ok) {
        setCurrent(null);
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <span ref={wrapRef} className={"relative inline-flex items-center gap-1 " + (className ?? "")}>
      {current ? (
        <Link
          href={`${HREF_BASE[relatedTable]}/${current.id}`}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {current.label}
        </Link>
      ) : (
        <span className="text-black/40 dark:text-white/40">
          {placeholder ?? "Add"}
        </span>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="shrink-0 text-black/30 dark:text-white/30 hover:text-black/70 dark:hover:text-white/70 transition-colors"
        aria-label="Change link"
      >
        <ChevronIcon className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          <RelationSearchPicker table={relatedTable} onSelect={handleSelect} />
          {current && (
            <button
              onClick={handleClear}
              className="w-full text-left px-3 py-2 text-sm text-black/50 dark:text-white/50 border-t border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </span>
  );
}
