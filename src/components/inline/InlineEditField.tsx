"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField, type TableName } from "@/app/actions/records";
import { PencilIcon } from "./icons";

type FieldType = "text" | "textarea" | "number" | "date";

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
  /** Format the value for read-mode display (e.g. money). Defaults to raw value. */
  format?: (v: string | number | null) => React.ReactNode;
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

  const displayValue = format ? format(current) : current;

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
        } else if (e.key === "Enter" && type !== "textarea") {
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
        {type === "textarea" ? (
          <textarea {...commonProps} rows={3} />
        ) : (
          <input {...commonProps} type={type === "number" ? "number" : type} />
        )}
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  const isEmpty = displayValue == null || displayValue === "";

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
