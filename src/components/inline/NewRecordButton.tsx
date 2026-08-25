"use client";

import { useEffect, useRef, useState } from "react";
import type { TableName } from "@/app/actions/records";
import CreateRecordModal from "./CreateRecordModal";

const TYPES: { key: TableName; label: string }[] = [
  { key: "contacts", label: "Contact" },
  { key: "companies", label: "Venue" },
  { key: "events", label: "Event" },
  { key: "plays", label: "Play" },
];

export default function NewRecordButton() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalType, setModalType] = useState<TableName | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        onClick={() => setMenuOpen((o) => !o)}
        className="rounded-md bg-ridge-orange text-white text-sm font-medium px-4 py-2 hover:bg-ridge-orange-dark transition-colors"
      >
        + New
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 w-36 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden z-30">
          {TYPES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setModalType(t.key);
                setMenuOpen(false);
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {modalType && (
        <CreateRecordModal table={modalType} onClose={() => setModalType(null)} />
      )}
    </div>
  );
}
