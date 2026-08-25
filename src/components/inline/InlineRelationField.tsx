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
  confirmSwitch,
}: {
  table: TableName;
  id: string;
  field: string;
  relatedTable: SearchTable;
  value: { id: string; label: string } | null;
  placeholder?: string;
  className?: string;
  /** Require an extra confirm step before REPLACING an existing value (not
   * shown when setting the field for the first time). Used on fields where
   * accidentally reassigning the "primary" record should take more than one
   * click. */
  confirmSwitch?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(value);
  const [pendingSelection, setPendingSelection] = useState<{ id: string; label: string } | null>(
    null
  );
  const [, startTransition] = useTransition();
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setPendingSelection(null);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function commitSelection(newId: string, label: string) {
    startTransition(async () => {
      const res = await updateField(table, id, field, newId);
      if (res.ok) {
        setCurrent({ id: newId, label });
        setOpen(false);
        setPendingSelection(null);
        router.refresh();
      }
    });
  }

  function handleSelect(newId: string, label: string) {
    if (confirmSwitch && current) {
      setPendingSelection({ id: newId, label });
      return;
    }
    commitSelection(newId, label);
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
        <div className="absolute z-20 top-full left-0 mt-1 w-64 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          {pendingSelection ? (
            <div className="p-3 text-sm">
              <p className="text-black/70 dark:text-white/70 mb-3">
                Replace the current primary link with{" "}
                <span className="font-medium">{pendingSelection.label}</span>?
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => commitSelection(pendingSelection.id, pendingSelection.label)}
                  className="flex-1 rounded-md bg-ridge-orange text-white text-xs font-medium px-3 py-1.5 hover:bg-ridge-orange-dark transition-colors"
                >
                  Confirm switch
                </button>
                <button
                  type="button"
                  onClick={() => setPendingSelection(null)}
                  className="flex-1 rounded-md border border-black/15 dark:border-white/15 text-xs font-medium px-3 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <RelationSearchPicker table={relatedTable} onSelect={handleSelect} />
              {current && (
                <button
                  onClick={handleClear}
                  className="w-full text-left px-3 py-2 text-sm text-black/50 dark:text-white/50 border-t border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  Clear
                </button>
              )}
            </>
          )}
        </div>
      )}
    </span>
  );
}
