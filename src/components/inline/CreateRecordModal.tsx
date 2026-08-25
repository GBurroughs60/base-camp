"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRecord, type TableName } from "@/app/actions/records";
import RelationSearchPicker from "./RelationSearchPicker";
import { ChevronIcon } from "./icons";

const ROUTE: Record<TableName, string> = {
  contacts: "/contacts",
  companies: "/companies",
  events: "/events",
  plays: "/plays",
  artists: "/artists",
};

const TITLE: Record<TableName, string> = {
  contacts: "New Contact",
  companies: "New Venue",
  events: "New Event",
  plays: "New Play",
  artists: "New Artist",
};

const COMPANY_TYPES = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "agency", label: "Agency" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

// A small "pick or create" slot used for Play's venue/event, which don't
// have a parent record id to write to yet -- selection just lives in local
// state until the whole form is submitted.
function PickerSlot({
  table,
  label,
  selected,
  onChange,
}: {
  table: "companies" | "events";
  label: string;
  selected: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <div className="flex items-center justify-between rounded border border-black/15 dark:border-white/15 px-2 py-1.5">
        <span className="text-sm">
          {selected ? (
            selected.label
          ) : (
            <span className="text-black/40 dark:text-white/40">
              No {label.toLowerCase()} selected
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {selected && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="text-xs text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
          >
            <ChevronIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          <RelationSearchPicker
            table={table}
            onSelect={(id, l) => {
              onChange({ id, label: l });
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function CreateRecordModal({
  table,
  onClose,
}: {
  table: TableName;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState("venue");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [showDate, setShowDate] = useState("");
  const [venue, setVenue] = useState<{ id: string; label: string } | null>(null);
  const [event, setEvent] = useState<{ id: string; label: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameLabel = table === "contacts" ? "Full name" : "Name";
  const playNeedsLink = table === "plays" && !venue && !event;

  async function handleSubmit() {
    setError(null);

    if (table !== "plays" && !name.trim()) {
      setError(`${nameLabel} is required`);
      return;
    }
    if (playNeedsLink) {
      setError("Pick or create a venue or event");
      return;
    }

    const data: Record<string, unknown> =
      table === "contacts"
        ? { full_name: name, email: email || null, phone: phone || null }
        : table === "companies"
          ? { name, type, city: city || null, state: state || null }
          : table === "events"
            ? { name, city: city || null, state: state || null }
            : table === "artists"
              ? { name }
              : {
                  show_date: showDate || null,
                  venue_id: venue?.id ?? null,
                  event_id: event?.id ?? null,
                };

    setSubmitting(true);
    const res = await createRecord(table, data);
    setSubmitting(false);

    if (res.ok) {
      router.push(`${ROUTE[table]}/${res.data.id}`);
      router.refresh();
    } else {
      setError(res.error);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-xl p-5"
      >
        <h2 className="font-display text-lg font-medium mb-4">{TITLE[table]}</h2>

        <div className="space-y-3">
          {table === "plays" ? (
            <>
              <div>
                <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                  Show date
                </label>
                <input
                  type="date"
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                />
              </div>
              <div>
                <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                  Venue
                </label>
                <PickerSlot table="companies" label="Venue" selected={venue} onChange={setVenue} />
              </div>
              <div>
                <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                  Event
                </label>
                <PickerSlot table="events" label="Event" selected={event} onChange={setEvent} />
              </div>
              <p className="text-xs text-black/40 dark:text-white/40">
                At least a venue or event is required. Everything else can be filled in after creating the play.
              </p>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                  {nameLabel}
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                />
              </div>
              {table === "contacts" && (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange placeholder:text-black/30 dark:placeholder:text-white/30"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      Phone
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Optional"
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange placeholder:text-black/30 dark:placeholder:text-white/30"
                    />
                  </div>
                </div>
              )}
              {table === "companies" && (
                <div>
                  <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                    Type
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                  >
                    {COMPANY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {(table === "companies" || table === "events") && (
                <div className="flex gap-2">
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      City
                    </label>
                    <input
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                    />
                  </div>
                  <div className="w-1/2">
                    <label className="block text-xs text-black/50 dark:text-white/50 mb-1">
                      State
                    </label>
                    <input
                      value={state}
                      onChange={(e) => setState(e.target.value)}
                      className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1.5 text-sm outline-none focus:border-ridge-orange"
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : `Create ${TITLE[table].replace("New ", "")}`}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
