"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateField, type TableName } from "@/app/actions/records";
import { PencilIcon, ImageIcon } from "./icons";

// A photo slot backed by a plain URL, not a real upload -- paste a link to a
// hosted image (press shot, promo photo, whatever) and it displays here the
// same way every other field on a record is click-to-edit text. If the link
// breaks or isn't an image, this falls back to the placeholder rather than
// showing a broken-image icon.
export default function InlineImageField({
  table,
  id,
  field,
  value,
  size = 96,
}: {
  table: TableName;
  id: string;
  field: string;
  value: string | null;
  /** Square side length in pixels. */
  size?: number;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(value);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);
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

  function commit() {
    const trimmed = draft.trim();
    const next = trimmed === "" ? null : trimmed;

    if (next === current) {
      setEditing(false);
      return;
    }

    startTransition(async () => {
      const res = await updateField(table, id, field, next);
      if (res.ok) {
        setCurrent(next);
        setBroken(false);
        setEditing(false);
        setError(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  const style = { width: size, height: size };

  if (editing) {
    return (
      <div style={style} className="shrink-0 flex flex-col gap-1">
        <input
          ref={inputRef}
          value={draft}
          disabled={pending}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setEditing(false);
              setError(null);
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="Paste image URL"
          className="w-full rounded border border-ridge-orange/50 bg-white dark:bg-neutral-900 px-1.5 py-1 text-xs outline-none focus:border-ridge-orange disabled:opacity-50"
        />
        {error && <span className="text-xs text-red-500">{error}</span>}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={beginEdit}
      style={style}
      aria-label={current ? "Change photo" : "Add photo"}
      className="group/photo relative shrink-0 rounded-lg overflow-hidden border border-black/10 dark:border-white/10 bg-black/[.03] dark:bg-white/[.04] flex items-center justify-center"
    >
      {current && !broken ? (
        // Pasted links, not local assets -- next/image can't optimize an
        // arbitrary external host without allow-listing it up front.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={current}
          alt=""
          onError={() => setBroken(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <ImageIcon className="w-6 h-6 text-black/25 dark:text-white/25" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover/photo:opacity-100 transition-opacity">
        <PencilIcon className="w-4 h-4 text-white" />
      </span>
    </button>
  );
}
