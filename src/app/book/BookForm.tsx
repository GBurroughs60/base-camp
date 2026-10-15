"use client";

import { useEffect, useState } from "react";
import type { BookableArtist } from "@/app/actions/offerIntake";
import { submitOfferInquiry } from "@/app/actions/offerIntake";
import TicketTierEditor from "@/components/inline/TicketTierEditor";
import { type TierDraft, makeEmptyTierDraft } from "@/lib/ticketTiers";

const inputClass =
  "border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent text-sm focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors";

const initialState = {
  companyUrl: "",
  artistId: "",
  venueName: "",
  address: "",
  city: "",
  state: "",
  showDate: "",
  showType: "",
  showTime: "",
  showLength: "",
  capacity: "",
  ageLimit: "",
  guaranteeAmount: "",
  ticketPriceTiers: [makeEmptyTierDraft()] as TierDraft[],
  dealTerms: "",
  radiusClause: "",
  productionContactName: "",
  productionContactInfo: "",
  productionProvided: false,
  foodProvided: false,
  drinksProvided: false,
  hotelProvided: false,
  travelProvided: false,
  notes: "",
  buyerCompany: "",
  buyerName: "",
  buyerEmail: "",
  buyerPhone: "",
  buyerAddress: "",
  buyerCity: "",
  buyerState: "",
  buyerZip: "",
};

type FormState = typeof initialState;

// 2026-10-15: Ben Hooker's second /book attempt vanished with no trace at
// all -- not even in the safety-net log added for the first incident (see
// offerIntake.ts and docs/outreach-engine-plan.md section 8). A clean test
// submission through the live page worked perfectly, which points at the
// one failure mode that never reaches the server at all: a tab/link left
// open across a deploy. Server Actions are tied to the specific build that
// rendered the page, so clicking Submit on a stale tab throws instead of
// calling anything -- old code had no try/catch around that call, so it
// failed completely silently (stuck on "Submitting…", nothing logged,
// nothing shown). Greg's fair pushback: a prospect shouldn't have to know
// to "refresh and try again" for this to work. So this now: (1) autosaves
// whatever's been typed to sessionStorage as they go, (2) catches that
// failure instead of swallowing it, and (3) offers a one-click reload that
// restores everything they'd already entered -- nothing to retype, no
// technical understanding required on their end.
const DRAFT_STORAGE_KEY = "book-form-draft-v1";

function loadDraft(): FormState {
  try {
    const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw);
    // Shallow-merge over initialState so a saved draft from before a field
    // was added/removed can't produce a malformed FormState.
    return { ...initialState, ...parsed };
  } catch {
    return initialState;
  }
}

function saveDraft(form: FormState) {
  try {
    sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(form));
  } catch {
    // Best-effort only -- a private window or blocked storage just means no
    // autosave, never a reason to fail the form itself.
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // Same as above -- nothing to do if storage isn't available.
  }
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-black/50 dark:text-white/50">{label}</span>
      {children}
    </label>
  );
}

function ToggleChip({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      className={`px-3 py-1 text-sm rounded-full border transition-colors ${
        checked
          ? "bg-ridge-orange text-white border-transparent"
          : "border-black/15 dark:border-white/15 text-black/50 dark:text-white/50 hover:border-ridge-orange/50"
      }`}
    >
      {label}: {checked ? "Yes" : "No"}
    </button>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm flex flex-col gap-3">
      <h2 className="font-medium text-sm">{title}</h2>
      {children}
    </div>
  );
}

export default function BookForm({ artists }: { artists: BookableArtist[] }) {
  // loadDraft() itself falls back to initialState wherever sessionStorage
  // isn't available (SSR included, via its own try/catch), so this is safe
  // both server- and client-side. React doesn't hydration-warn on a
  // mismatched controlled-input *value* specifically (the same leniency
  // that lets browser autofill coexist with SSR), which is what makes
  // restoring the client's real draft straight from this initializer, no
  // separate post-mount effect needed, hydration-safe here.
  const [form, setForm] = useState<FormState>(loadDraft);
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error" | "stale">("idle");
  const [error, setError] = useState<string | null>(null);
  // Captured once, the moment this form mounts -- paired with the honeypot
  // server-side so a single false positive (e.g. autofill) can't silently
  // discard a real submission on its own. See offerIntake.ts.
  const [renderedAt] = useState(() => Date.now());

  // Autosave as they type, so a forced reload (see the "stale" branch
  // below) never costs them having to retype anything.
  useEffect(() => {
    saveDraft(form);
  }, [form]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

    try {
      const res = await submitOfferInquiry({ ...form, renderedAt });
      if (res.ok) {
        clearDraft();
        setStatus("done");
      } else {
        setStatus("error");
        setError(res.error);
      }
    } catch (err) {
      // The one failure mode that never reaches offerIntake.ts's own
      // safety-net log at all: this tab was open from before a deploy and
      // is calling a Server Action reference that no longer exists on the
      // current build. Whatever was typed is already autosaved above, so
      // a reload (which fetches the current build, and the loadDraft()
      // initializer above restores from sessionStorage) gets them
      // resubmitting with nothing lost -- no need for them to understand
      // what happened or retype anything.
      console.error("Offer submission failed unexpectedly (likely a stale page):", err);
      setStatus("stale");
    }
  }

  if (status === "done") {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm text-center">
        <h2 className="font-medium text-lg mb-1">Thanks!</h2>
        <p className="text-sm text-black/70 dark:text-white/70">
          Your offer has been submitted. Someone from our team will be in touch.
        </p>
      </div>
    );
  }

  if (status === "stale") {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm text-center">
        <h2 className="font-medium text-lg mb-1">One quick refresh needed</h2>
        <p className="text-sm text-black/70 dark:text-white/70 mb-4">
          This page has been open a while and needs to reload before it can submit. Nothing
          you&apos;ve entered will be lost -- click below and we&apos;ll bring it right back.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2.5 px-6 font-medium transition-colors"
        >
          Reload &amp; continue
        </button>
      </div>
    );
  }

  if (artists.length === 0) {
    return (
      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm text-center">
        <p className="text-sm text-black/70 dark:text-white/70">
          We&apos;re not currently accepting new offers. Please check back later.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Honeypot -- invisible to real visitors, catches bots that
          autofill every field on a form. Left unlabeled visually and kept
          out of tab order; a filled value makes the server action no-op. */}
      <div
        className="absolute -left-[9999px] w-px h-px overflow-hidden"
        aria-hidden="true"
      >
        <label>
          Company Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.companyUrl}
            onChange={(e) => set("companyUrl", e.target.value)}
          />
        </label>
      </div>

      <SectionCard title="Artist & Show">
        <Field label="Artist *">
          <select
            required
            value={form.artistId}
            onChange={(e) => set("artistId", e.target.value)}
            className={inputClass}
          >
            <option value="">Select an artist…</option>
            {artists.map((a) => (
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
              required
              value={form.showDate}
              onChange={(e) => set("showDate", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Type of show">
            <input
              type="text"
              placeholder="Private, public, corporate…"
              value={form.showType}
              onChange={(e) => set("showType", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Time of performance">
            <input
              type="text"
              placeholder="9:00 PM"
              value={form.showTime}
              onChange={(e) => set("showTime", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Duration of performance">
            <input
              type="text"
              placeholder="60 min, 2x45 min sets…"
              value={form.showLength}
              onChange={(e) => set("showLength", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Venue name">
          <input
            type="text"
            value={form.venueName}
            onChange={(e) => set("venueName", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Address">
          <input
            type="text"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="City">
            <input
              type="text"
              value={form.city}
              onChange={(e) => set("city", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.state}
              onChange={(e) => set("state", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Capacity">
            <input
              type="number"
              min="0"
              value={form.capacity}
              onChange={(e) => set("capacity", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Age limit">
            <input
              type="text"
              placeholder="All ages, 21+…"
              value={form.ageLimit}
              onChange={(e) => set("ageLimit", e.target.value)}
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
            value={form.guaranteeAmount}
            onChange={(e) => set("guaranteeAmount", e.target.value)}
            className={inputClass + " max-w-[12rem]"}
          />
        </Field>
        <Field label="Ticket price">
          <TicketTierEditor
            tiers={form.ticketPriceTiers}
            onChange={(t) => set("ticketPriceTiers", t)}
          />
        </Field>
        <Field label="Deal terms">
          <textarea
            rows={2}
            placeholder="Door split, tax, merch rate, etc."
            value={form.dealTerms}
            onChange={(e) => set("dealTerms", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Radius clause">
          <input
            type="text"
            placeholder="e.g. 50 miles / 60 days, or leave blank if none"
            value={form.radiusClause}
            onChange={(e) => set("radiusClause", e.target.value)}
            className={inputClass}
          />
        </Field>
      </SectionCard>

      <SectionCard title="Production & Hospitality">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Production contact name">
            <input
              type="text"
              value={form.productionContactName}
              onChange={(e) => set("productionContactName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Cell or email">
            <input
              type="text"
              value={form.productionContactInfo}
              onChange={(e) => set("productionContactInfo", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2 mt-1">
          <ToggleChip
            label="Production"
            checked={form.productionProvided}
            onChange={(v) => set("productionProvided", v)}
          />
          <ToggleChip
            label="Food"
            checked={form.foodProvided}
            onChange={(v) => set("foodProvided", v)}
          />
          <ToggleChip
            label="Drinks"
            checked={form.drinksProvided}
            onChange={(v) => set("drinksProvided", v)}
          />
          <ToggleChip
            label="Hotel"
            checked={form.hotelProvided}
            onChange={(v) => set("hotelProvided", v)}
          />
          <ToggleChip
            label="Travel"
            checked={form.travelProvided}
            onChange={(v) => set("travelProvided", v)}
          />
        </div>
      </SectionCard>

      <SectionCard title="Buyer">
        <Field label="Buyer company / organization">
          <input
            type="text"
            value={form.buyerCompany}
            onChange={(e) => set("buyerCompany", e.target.value)}
            className={inputClass}
          />
        </Field>
        <p className="text-xs text-black/40 dark:text-white/40 -mt-1">
          The person below will be treated as the buyer&apos;s signer on the contract — please use
          whoever is actually authorized to sign, not just whoever is submitting this form.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Signer name *">
            <input
              type="text"
              required
              value={form.buyerName}
              onChange={(e) => set("buyerName", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Signer email *">
            <input
              type="email"
              required
              value={form.buyerEmail}
              onChange={(e) => set("buyerEmail", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Signer cell phone">
          <input
            type="text"
            value={form.buyerPhone}
            onChange={(e) => set("buyerPhone", e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Mailing address">
          <input
            type="text"
            value={form.buyerAddress}
            onChange={(e) => set("buyerAddress", e.target.value)}
            className={inputClass}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="City">
            <input
              type="text"
              value={form.buyerCity}
              onChange={(e) => set("buyerCity", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              type="text"
              value={form.buyerState}
              onChange={(e) => set("buyerState", e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Zip">
            <input
              type="text"
              value={form.buyerZip}
              onChange={(e) => set("buyerZip", e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="Anything Else">
        <textarea
          rows={3}
          placeholder="Anything else we should know"
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          className={inputClass}
        />
      </SectionCard>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="w-full rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2.5 font-medium transition-colors disabled:opacity-50"
      >
        {status === "submitting" ? "Submitting…" : "Submit Offer"}
      </button>
    </form>
  );
}
