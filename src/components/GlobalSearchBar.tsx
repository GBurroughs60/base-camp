"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { globalSearch, type GlobalSearchGroup } from "@/app/actions/records";
import { SearchIcon } from "./inline/icons";

export default function GlobalSearchBar() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [groups, setGroups] = useState<GlobalSearchGroup[]>([]);
  const [searched, setSearched] = useState(false);
  const [pending, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function onChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (!trimmed) {
      setGroups([]);
      setSearched(false);
      setOpen(false);
      return;
    }

    setOpen(true);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await globalSearch(trimmed);
        setGroups(res);
        setSearched(true);
      });
    }, 250);
  }

  const totalResults = groups.reduce((n, g) => n + g.results.length, 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-lg mx-auto">
      <div className="relative">
        <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => query.trim() && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.currentTarget.blur();
              setOpen(false);
            }
          }}
          placeholder="Search contacts, venues, events, plays..."
          className="w-full rounded-full border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 pl-9 pr-4 py-2 text-sm outline-none focus:border-ridge-orange transition-colors"
        />
      </div>

      {open && (
        <div className="absolute z-20 mt-1.5 w-full rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg max-h-[70vh] overflow-y-auto">
          {pending && !searched ? (
            <p className="p-4 text-sm text-black/50 dark:text-white/50">Searching...</p>
          ) : totalResults === 0 ? (
            <p className="p-4 text-sm text-black/50 dark:text-white/50">
              No matches in contacts, venues, events, or plays.
            </p>
          ) : (
            <div className="py-1">
              {groups.map((g) => (
                <div key={g.table} className="py-1">
                  <p className="px-4 pt-1.5 pb-1 text-[11px] font-medium uppercase tracking-wide text-black/40 dark:text-white/40">
                    {g.label}
                  </p>
                  {g.results.map((r) => (
                    <Link
                      key={r.id}
                      href={r.href}
                      onClick={() => setOpen(false)}
                      className="block px-4 py-1.5 text-sm hover:bg-black/[.03] dark:hover:bg-white/[.06] transition-colors"
                    >
                      <span className="text-ridge-orange-dark dark:text-ridge-orange">
                        {r.label}
                      </span>
                      {r.sublabel && (
                        <span className="text-black/50 dark:text-white/50">
                          {" "}
                          · {r.sublabel}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
