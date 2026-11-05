"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateEventGenreTags } from "@/app/actions/eventGenre";

// Chip-style editor for events.genre_tags (text[]) -- an open tag set, not
// a fixed dropdown (2026-11-05, per Greg). Each add/remove writes the
// whole array immediately (no separate "save" step), same instant-commit
// feel as every other inline-edit field in the app. `suggestions` feeds a
// <datalist> so typing nudges toward tags already in use elsewhere
// (listDistinctGenreTags, eventGenre.ts) instead of fragmenting into near-
// duplicates, without actually restricting what can be typed.
export default function GenreTagsField({
  eventId,
  tags,
  suggestions,
}: {
  eventId: string;
  tags: string[];
  suggestions: string[];
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(tags);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  function save(next: string[]) {
    setError(null);
    startTransition(async () => {
      const res = await updateEventGenreTags(eventId, next);
      if (res.ok) {
        setCurrent(next);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function commitDraft() {
    const value = draft.trim().toLowerCase();
    setDraft("");
    if (value === "" || current.includes(value)) {
      setAdding(false);
      return;
    }
    save([...current, value]);
    setAdding(false);
  }

  function remove(tag: string) {
    save(current.filter((t) => t !== tag));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {current.map((tag) => (
        <span
          key={tag}
          className="group/tag inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-ridge-orange/10 border border-ridge-orange/25 text-ridge-orange-dark dark:text-ridge-orange"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={pending}
            aria-label={`Remove ${tag}`}
            className="opacity-0 group-hover/tag:opacity-60 hover:!opacity-100 transition-opacity disabled:opacity-30"
          >
            ×
          </button>
        </span>
      ))}

      {adding ? (
        <>
          <input
            ref={inputRef}
            list="genre-tag-suggestions"
            type="text"
            value={draft}
            disabled={pending}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                commitDraft();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDraft("");
                setAdding(false);
              }
            }}
            placeholder="Genre"
            className="w-24 rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-0.5 text-xs outline-none focus:border-ridge-orange disabled:opacity-50"
          />
          <datalist id="genre-tag-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          disabled={pending}
          className="text-xs text-black/40 dark:text-white/40 hover:text-ridge-orange-dark dark:hover:text-ridge-orange disabled:opacity-50"
        >
          + Add genre
        </button>
      )}
      {error && <span className="text-xs text-red-500 w-full">{error}</span>}
    </div>
  );
}
