"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateFields, type TableName } from "@/app/actions/records";
import { PencilIcon } from "./icons";

// City and state are two separate columns, but visually they read as one
// "location" -- putting a pencil after each one (like a plain InlineEditField
// pair would) spaces them out and doubles the hover targets for what's really
// a single edit action. This renders them as one "City, ST" unit with a
// single trailing pencil; editing shows both underlying inputs side by side
// and commits both fields together via updateFields.
export default function InlineLocationField({
  table,
  id,
  city,
  state,
  className,
}: {
  table: TableName;
  id: string;
  city: string | null;
  state: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [currentCity, setCurrentCity] = useState(city);
  const [currentState, setCurrentState] = useState(state);
  const [draftCity, setDraftCity] = useState(city ?? "");
  const [draftState, setDraftState] = useState(state ?? "");
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [pending, startTransition] = useTransition();
  const cityRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (editing) {
      cityRef.current?.focus();
      cityRef.current?.select();
    }
  }, [editing]);

  function beginEdit() {
    if (pending) return;
    setDraftCity(currentCity ?? "");
    setDraftState(currentState ?? "");
    setError(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setError(null);
  }

  function commit() {
    const newCity = draftCity.trim() || null;
    const newState = draftState.trim() || null;

    if (newCity === currentCity && newState === currentState) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateFields(table, id, { city: newCity, state: newState });
      if (res.ok) {
        setCurrentCity(newCity);
        setCurrentState(newState);
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

  // Only commit once focus leaves both inputs -- tabbing/clicking from the
  // city box into the state box shouldn't fire two separate saves.
  function handleBlur(e: React.FocusEvent<HTMLElement>) {
    const next = e.relatedTarget as Node | null;
    if (next && containerRef.current?.contains(next)) return;
    commit();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  const isEmpty = !currentCity && !currentState;
  const displayValue = [currentCity, currentState].filter(Boolean).join(", ");

  if (editing) {
    return (
      <span
        ref={containerRef}
        className={"inline-flex items-center gap-1 " + (className ?? "")}
      >
        <input
          ref={cityRef}
          value={draftCity}
          disabled={pending}
          placeholder="City"
          onChange={(e) => setDraftCity(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-24 min-w-0 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50"
        />
        <span>,</span>
        <input
          value={draftState}
          disabled={pending}
          placeholder="State"
          onChange={(e) => setDraftState(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          className="w-14 min-w-0 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-sm outline-none focus:border-ridge-orange disabled:opacity-50"
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </span>
    );
  }

  return (
    <span className={"group/field inline-flex items-center gap-1.5 " + (className ?? "")}>
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
        {isEmpty ? "Add location" : displayValue}
      </span>
      <button
        type="button"
        onClick={beginEdit}
        aria-label="Edit location"
        className="shrink-0 opacity-0 group-hover/field:opacity-50 hover:!opacity-100 transition-opacity"
      >
        <PencilIcon className="w-3 h-3" />
      </button>
    </span>
  );
}
