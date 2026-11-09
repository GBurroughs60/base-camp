"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createRecord,
  listActiveArtists,
  updateTierField,
  searchRecords,
  fuzzyMatchCompanies,
  type CompanyFuzzyMatch,
  type SearchTable,
} from "@/app/actions/records";
import TicketTierEditor from "./TicketTierEditor";
import { type TierDraft, makeEmptyTierDraft, draftsToSavedPriceTiers } from "@/lib/ticketTiers";
import { Field, ToggleChip, SectionCard, inputClass } from "./PlayFormParts";
import { ChevronIcon, SearchIcon } from "./icons";

const COMPANY_TYPES = [
  { value: "venue", label: "Venue" },
  { value: "promoter", label: "Promoter" },
  { value: "agency", label: "Agency" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other" },
];

const RELATED_LABEL: Record<SearchTable, string> = {
  companies: "Venue",
  events: "Event",
  contacts: "Contact",
};

// Search-existing-or-quick-create slot for Venue/Event/Contact -- same
// search-first convention RelationSearchPicker already provides for an
// existing record's inline fields, just inlined here (rather than through
// RelationSearchPicker's own popover, which assumes a parent record id to
// write associations to) since all three selections here just live in local
// state until the whole play is submitted in one insert. Deliberately NOT
// the public /book form's free-text-plus-server-fuzzy-match approach for
// venue -- staff already know who they're dealing with and should search
// for an existing company/contact rather than risk creating a near-duplicate
// that a human has to notice and clean up later.
function PickerSlot({
  table,
  selected,
  onChange,
  // Only meaningful for table === "companies" -- lets the venue slot waive
  // the usual "website is required" quick-create rule for a private show,
  // where there's typically no venue website to link in the first place
  // (someone's backyard, a private residence, etc). Defaults to required so
  // every other PickerSlot usage (Event, Contact, and Venue on a non-private
  // show) is unaffected.
  websiteRequired = true,
}: {
  table: SearchTable;
  selected: { id: string; label: string } | null;
  onChange: (v: { id: string; label: string } | null) => void;
  websiteRequired?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    { id: string; label: string; sublabel: string | null }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newType, setNewType] = useState("venue");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [fuzzyMatches, setFuzzyMatches] = useState<CompanyFuzzyMatch[]>([]);

  const label = RELATED_LABEL[table];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const rows = await searchRecords(table, query);
      if (!cancelled) {
        setResults(rows);
        setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, table, query]);

  useEffect(() => {
    if (table !== "companies" || !showCreate) {
      setFuzzyMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const matches = await fuzzyMatchCompanies(newName);
      if (!cancelled) setFuzzyMatches(matches);
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [table, showCreate, newName]);

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required");
      return;
    }
    if (table === "companies" && websiteRequired && !newWebsite.trim()) {
      setCreateError("Website is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const data: Record<string, unknown> =
      table === "contacts"
        ? { full_name: newName, email: newEmail || null, phone: newPhone || null }
        : table === "companies"
          ? {
              name: newName,
              type: newType,
              city: newCity || null,
              state: newState || null,
              email: newEmail || null,
              website: newWebsite || null,
            }
          : { name: newName };

    const res = await createRecord(table, data);
    setCreating(false);
    if (res.ok) {
      onChange({ id: res.data.id, label: newName });
      setOpen(false);
      setShowCreate(false);
    } else {
      setCreateError(res.error);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center justify-between rounded-md border border-black/15 dark:border-white/15 px-3 py-2">
        <span className="text-sm">
          {selected ? (
            selected.label
          ) : (
            <span className="text-black/40 dark:text-white/40">No {label.toLowerCase()} selected</span>
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
            onClick={() => {
              setOpen((o) => !o);
              setShowCreate(false);
              setQuery("");
            }}
            className="text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
          >
            <ChevronIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div className="absolute z-30 top-full left-0 mt-1 w-72 rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
          <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-black/10 dark:border-white/10">
            <SearchIcon className="w-3.5 h-3.5 text-black/40 dark:text-white/40 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowCreate(false);
              }}
              placeholder={`Search ${label.toLowerCase()}s...`}
              className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-black/40 dark:placeholder:text-white/40"
            />
          </div>

          {!showCreate && (
            <>
              <ul className="max-h-48 overflow-y-auto py-1">
                {loading && (
                  <li className="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">Searching…</li>
                )}
                {!loading && results.length === 0 && (
                  <li className="px-3 py-1.5 text-xs text-black/40 dark:text-white/40">No matches</li>
                )}
                {!loading &&
                  results.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange({ id: r.id, label: r.label });
                          setOpen(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                      >
                        {r.label}
                        {r.sublabel && (
                          <span className="text-black/40 dark:text-white/40"> · {r.sublabel}</span>
                        )}
                      </button>
                    </li>
                  ))}
              </ul>
              <button
                type="button"
                onClick={() => {
                  setNewName(query);
                  setNewEmail("");
                  setNewPhone("");
                  setNewWebsite("");
                  setShowCreate(true);
                }}
                className="w-full text-left px-3 py-2 text-sm text-ridge-orange-dark dark:text-ridge-orange border-t border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                + Create new {label.toLowerCase()}
              </button>
            </>
          )}

          {showCreate && (
            <div className="p-3 space-y-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={table === "contacts" ? "Full name" : "Name"}
                className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
              />
              {table === "contacts" && (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                  />
                  <input
                    type="tel"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    placeholder="Phone (optional)"
                    className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                  />
                </div>
              )}
              {table === "companies" && (
                <>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                  >
                    {COMPANY_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Email (optional)"
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                  />
                  <input
                    type="url"
                    value={newWebsite}
                    onChange={(e) => setNewWebsite(e.target.value)}
                    placeholder={websiteRequired ? "Website" : "Website (optional for a private show)"}
                    className="w-full rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                  />
                  <div className="flex gap-2">
                    <input
                      value={newCity}
                      onChange={(e) => setNewCity(e.target.value)}
                      placeholder="City"
                      className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                    />
                    <input
                      value={newState}
                      onChange={(e) => setNewState(e.target.value)}
                      placeholder="State"
                      className="w-1/2 rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
                    />
                  </div>
                </>
              )}
              {table === "companies" && fuzzyMatches.length > 0 && (
                <div className="rounded border border-amber-400/40 bg-amber-50 dark:bg-amber-500/10 p-2 space-y-1">
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Possible existing match — pick one instead of creating a duplicate:
                  </p>
                  {fuzzyMatches.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChange({ id: m.id, label: m.name });
                        setOpen(false);
                        setShowCreate(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded text-sm bg-white dark:bg-neutral-900 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                    >
                      {m.name}
                      {(m.city || m.state) && (
                        <span className="text-black/40 dark:text-white/40">
                          {" "}
                          · {[m.city, m.state].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {createError && <p className="text-xs text-red-500">{createError}</p>}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 rounded bg-ridge-orange text-white text-sm py-1 disabled:opacity-50"
                >
                  {creating ? "Creating…" : `Create ${label}`}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded border border-black/15 dark:border-white/15 text-sm px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Full-scope internal "New Play" flow -- same field set and section-card
// style as the public /book offer-intake form (BookForm.tsx), so an agent
// entering a play directly can capture everything in one sitting instead of
// the old 4-field quick-create (artist/date/venue/event) that deferred
// everything else to inline-editing the play page afterward. Two
// deliberate departures from the public form, per how this is actually
// used internally rather than by an anonymous buyer:
//   - Venue/Event/Contact are search-existing-or-quick-create pickers
//     (PickerSlot above), not free text fuzzy-matched after the fact --
//     staff should find and reuse an existing record rather than risk
//     spinning up a near-duplicate that needs cleaning up later.
//   - No honeypot/draft-autosave/stale-build-recovery UX -- those exist on
//     the public page specifically because an anonymous visitor's work
//     must never be silently lost across a deploy; an authenticated
//     internal user hitting an error can just retry.
// Still goes through the same generic createRecord (not submitOfferInquiry/
// submit_offer_inquiry, which is the public, anon-facing RPC) so this stays
// on the same permission model and field whitelist as every other internal
// create/edit flow. New plays still land in 'pending_agent_approval' (the
// table's column default, same as every other path to creating a play) --
// Greg's call: every new play goes through the same approval gate
// regardless of who/how it was entered.
export default function NewPlayModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();

  const [artistOptions, setArtistOptions] = useState<{ id: string; name: string }[]>([]);
  const [artistId, setArtistId] = useState("");
  const [showDate, setShowDate] = useState("");
  const [showType, setShowType] = useState("");
  const [showTime, setShowTime] = useState("");
  const [showLength, setShowLength] = useState("");
  const [venue, setVenue] = useState<{ id: string; label: string } | null>(null);
  const [event, setEvent] = useState<{ id: string; label: string } | null>(null);
  const [capacity, setCapacity] = useState("");
  const [ageLimit, setAgeLimit] = useState("");

  // "Show type" is free text (same as the public /book form), not a fixed
  // dropdown, so this is a loose substring match rather than an exact-value
  // check -- catches "Private", "Private event", "Private party", etc.
  // without needing to lock the field down to an enum just for this.
  const isPrivateShow = showType.trim().toLowerCase().includes("private");

  const [guaranteeAmount, setGuaranteeAmount] = useState("");
  const [ticketPriceTiers, setTicketPriceTiers] = useState<TierDraft[]>([makeEmptyTierDraft()]);
  const [dealTerms, setDealTerms] = useState("");
  const [radiusClause, setRadiusClause] = useState("");

  const [productionContactName, setProductionContactName] = useState("");
  const [productionContactInfo, setProductionContactInfo] = useState("");
  const [productionProvided, setProductionProvided] = useState(false);
  const [foodProvided, setFoodProvided] = useState(false);
  const [drinksProvided, setDrinksProvided] = useState(false);
  const [hotelProvided, setHotelProvided] = useState(false);
  const [travelProvided, setTravelProvided] = useState(false);

  const [contact, setContact] = useState<{ id: string; label: string } | null>(null);
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listActiveArtists().then((rows) => {
      if (cancelled) return;
      setArtistOptions(rows);
      if (rows.length === 1) setArtistId(rows[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit() {
    setError(null);

    if (!artistId) {
      setError("Select an artist");
      return;
    }
    if (!showDate) {
      setError("Show date is required");
      return;
    }
    if (!venue && !event) {
      setError("Pick or create a venue or event");
      return;
    }

    setSubmitting(true);

    const data: Record<string, unknown> = {
      artist_id: artistId,
      show_date: showDate,
      venue_id: venue?.id ?? null,
      event_id: event?.id ?? null,
      show_type: showType || null,
      show_time: showTime || null,
      show_length: showLength || null,
      capacity: capacity.trim() !== "" ? Number(capacity) : null,
      age_limit: ageLimit || null,
      guarantee_amount: guaranteeAmount.trim() !== "" ? Number(guaranteeAmount) : null,
      deal_terms: dealTerms || null,
      radius_clause: radiusClause || null,
      production_contact_name: productionContactName || null,
      production_contact_info: productionContactInfo || null,
      production_provided: productionProvided,
      food_provided: foodProvided,
      drinks_provided: drinksProvided,
      hotel_provided: hotelProvided,
      travel_provided: travelProvided,
      primary_contact_id: contact?.id ?? null,
      notes: notes || null,
    };

    const res = await createRecord("plays", data);

    if (!res.ok) {
      setSubmitting(false);
      setError(res.error);
      return;
    }

    // Ticket tiers are a jsonb column, not part of the generic insert
    // whitelist (see TIER_FIELDS/updateTierField in records.ts) -- set in a
    // follow-up call once the play id exists. Best-effort: the play itself
    // already exists at this point, so a failure here is logged and
    // surfaced but never un-does the create or blocks navigating to it --
    // tiers can always be filled in from the play page same as today.
    const savedTiers = draftsToSavedPriceTiers(ticketPriceTiers);
    if (savedTiers.length > 0) {
      const tierRes = await updateTierField("plays", res.data.id, "ticket_price_tiers", savedTiers);
      if (!tierRes.ok) {
        console.error("New play created, but ticket tiers failed to save:", tierRes.error);
      }
    }

    setSubmitting(false);
    router.push(`/plays/${res.data.id}`);
    router.refresh();
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-8"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-full overflow-y-auto rounded-xl border border-black/10 dark:border-white/10 bg-neutral-50 dark:bg-neutral-950 shadow-xl p-6"
      >
        <h2 className="font-display text-lg font-medium mb-4">New Play</h2>

        <div className="flex flex-col gap-4">
          <SectionCard title="Artist & Show">
            <Field label="Artist *">
              <select
                value={artistId}
                onChange={(e) => setArtistId(e.target.value)}
                className={inputClass}
              >
                <option value="" disabled>
                  Select an artist…
                </option>
                {artistOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Show date *">
                <input
                  type="date"
                  value={showDate}
                  onChange={(e) => setShowDate(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Type of show">
                <input
                  type="text"
                  placeholder="Private, public, corporate…"
                  value={showType}
                  onChange={(e) => setShowType(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Time of performance">
                <input
                  type="text"
                  placeholder="9:00 PM"
                  value={showTime}
                  onChange={(e) => setShowTime(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Duration of performance">
                <input
                  type="text"
                  placeholder="60 min, 2x45 min sets…"
                  value={showLength}
                  onChange={(e) => setShowLength(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Venue">
                <PickerSlot
                  table="companies"
                  selected={venue}
                  onChange={setVenue}
                  websiteRequired={!isPrivateShow}
                />
              </Field>
              <Field label="Event">
                <PickerSlot table="events" selected={event} onChange={setEvent} />
              </Field>
            </div>
            <p className="text-xs text-black/40 dark:text-white/40 -mt-1">
              At least a venue or event is required.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Capacity">
                <input
                  type="number"
                  min="0"
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Age limit">
                <input
                  type="text"
                  placeholder="All ages, 21+…"
                  value={ageLimit}
                  onChange={(e) => setAgeLimit(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
          </SectionCard>

          <SectionCard title="The Offer">
            <Field label="Offer amount / guarantee">
              <input
                type="number"
                min="0"
                step="0.01"
                value={guaranteeAmount}
                onChange={(e) => setGuaranteeAmount(e.target.value)}
                className={inputClass + " max-w-[12rem]"}
              />
            </Field>
            <Field label="Ticket price">
              <TicketTierEditor tiers={ticketPriceTiers} onChange={setTicketPriceTiers} />
            </Field>
            <Field label="Deal terms">
              <textarea
                rows={2}
                placeholder="Door split, tax, merch rate, etc."
                value={dealTerms}
                onChange={(e) => setDealTerms(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Radius clause">
              <input
                type="text"
                placeholder="e.g. 50 miles / 60 days, or leave blank if none"
                value={radiusClause}
                onChange={(e) => setRadiusClause(e.target.value)}
                className={inputClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Production & Hospitality">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Production contact name">
                <input
                  type="text"
                  value={productionContactName}
                  onChange={(e) => setProductionContactName(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Cell or email">
                <input
                  type="text"
                  value={productionContactInfo}
                  onChange={(e) => setProductionContactInfo(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              <ToggleChip label="Production" checked={productionProvided} onChange={setProductionProvided} />
              <ToggleChip label="Food" checked={foodProvided} onChange={setFoodProvided} />
              <ToggleChip label="Drinks" checked={drinksProvided} onChange={setDrinksProvided} />
              <ToggleChip label="Hotel" checked={hotelProvided} onChange={setHotelProvided} />
              <ToggleChip label="Travel" checked={travelProvided} onChange={setTravelProvided} />
            </div>
          </SectionCard>

          <SectionCard title="Contact">
            <Field label="Primary contact">
              <PickerSlot table="contacts" selected={contact} onChange={setContact} />
            </Field>
            <p className="text-xs text-black/40 dark:text-white/40 -mt-1">
              The buyer/promoter contact for this show -- same role the public offer form&apos;s
              &quot;Buyer&quot; section fills in, shown in the Contact section on the play page.
            </p>
          </SectionCard>

          <SectionCard title="Anything Else">
            <textarea
              rows={3}
              placeholder="Anything else worth noting"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={inputClass}
            />
          </SectionCard>

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="flex gap-2 mt-5">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-md bg-ridge-orange text-white text-sm font-medium py-2.5 hover:bg-ridge-orange-dark transition-colors disabled:opacity-50"
          >
            {submitting ? "Creating…" : "Create Play"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md border border-black/15 dark:border-white/15 text-sm px-4 py-2.5 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
