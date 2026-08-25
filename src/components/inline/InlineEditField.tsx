"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField, type TableName } from "@/app/actions/records";
import { PencilIcon } from "./icons";

type FieldType = "text" | "textarea" | "number" | "date";

// Named presets, not raw functions -- this is a Client Component ("use
// client" above) that gets rendered directly from async Server Components
// (the detail pages). React Server Components can only pass serializable
// props across that boundary, and a function closure isn't serializable,
// so `format` used to blow up every play detail page at request time
// (functions can't cross the RSC boundary) even though it type-checked and
// built cleanly. Formatting now lives here, selected by a plain string key.
type FormatPreset = "money" | "date" | "percent";

function formatMoney(n: number | null) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatLongDate(d: string | null) {
  if (!d) return "—";
  const parsed = new Date(`${d}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function applyFormat(preset: FormatPreset | undefined, v: string | number | null) {
  if (!preset) return v;
  switch (preset) {
    case "money":
      return formatMoney(typeof v === "number" ? v : v === null ? null : Number(v));
    case "date":
      return formatLongDate(v as string | null);
    case "percent":
      return v === null || v === "" ? "—" : `${v}%`;
  }
}

export default function InlineEditField({
  table,
  id,
  field,
  value,
  type = "text",
  placeholder = "Add",
  format,
  href,
  className,
  inputClassName,
}: {
  table: TableName;
  id: string;
  field: string;
  value: string | number | null;
  type?: FieldType;
  placeholder?: string;
  /** Named formatting preset for read-mode display. Defaults to raw value. */
  format?: FormatPreset;
  /** When set and the field has a value, render it as a real link (opens in
   * a new tab) instead of click-to-edit text -- editing then happens only
   * via the pencil icon. Used for website fields. */
  href?: string;
  className?: string;
  inputClassName?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(String(value ?? ""));
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  function beginEdit() {
    if (pending) return;
    setDraft(String(current ?? ""));
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const trimmed = typeof draft === "string" ? draft.trim() : draft;
    const newValue: string | number | null =
      trimmed === ""
        ? null
        : type === "number"
          ? Number(trimmed)
          : trimmed;

    if (
      newValue === current ||
      (newValue === null && (current === null || current === undefined))
    ) {
      setEditing(false);
      return;
    }

    if (type === "number" && newValue !== null && Number.isNaN(newValue)) {
      setError("Not a number");
      return;
    }

    startTransition(async () => {
      const res = await updateField(table, id, field, newValue);
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

  const displayValue = applyFormat(format, current);
  const isEmpty = displayValue == null || displayValue === "";

  // Notes-style fields get their own layout: a block-level box that fills
  // whatever height its parent card gives it (h-full), rather than the
  // inline "text + trailing pencil" treatment below, which never grows past
  // its own content and leaves a multi-line card looking mostly empty.
  if (type === "textarea") {
    if (editing) {
      return (
        <div className={"flex flex-col gap-1 h-full " + (className ?? "")}>
          <textarea
            ref={inputRef as never}
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            className={
              "w-full h-full min-h-[140px] flex-1 resize-none rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-3 py-2 text-sm outline-none focus:border-ridge-orange disabled:opacity-50 " +
              (inputClassName ?? "")
            }
          />
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
      );
    }

    return (
      <div className={"group/field relative h-full min-h-[140px] " + (className ?? "")}>
        <div
          role="button"
          tabIndex={0}
          onClick={beginEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") beginEdit();
          }}
          className={
            "h-full w-full cursor-text rounded px-3 py-2 whitespace-pre-wrap transition-colors " +
            (flash ? "text-ridge-orange-dark dark:text-ridge-orange" : "") +
            (isEmpty ? " text-black/40 dark:text-white/40" : "")
          }
        >
          {isEmpty ? placeholder : displayValue}
        </div>
        <button
          type="button"
          onClick={beginEdit}
          aria-label="Edit"
          className="absolute top-2 right-2 shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity"
        >
          <PencilIcon className="w-3 h-3" />
        </button>
      </div>
    );
  }

  if (editing) {
    const commonProps = {
      ref: inputRef as never,
      value: draft,
      disabled: pending,
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
      ) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        } else if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      },
      className:
        "w-full min-w-0 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50 " +
        (inputClassName ?? ""),
    };

    return (
      <span className={"inline-flex flex-col gap-1 " + (className ?? "")}>
        <input {...commonProps} type={type === "number" ? "number" : type} />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <span
      className={
        "group/field inline-flex items-center gap-1.5 " + (className ?? "")
      }
    >
      {href && !isEmpty ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          {displayValue}
        </a>
      ) : (
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
          {isEmpty ? placeholder : displayValue}
        </span>
      )}
      <button
        type="button"
        onClick={beginEdit}
        aria-label="Edit"
        className="shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity"
      >
        <PencilIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
