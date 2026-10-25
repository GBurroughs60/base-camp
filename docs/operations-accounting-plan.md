# Operations & Accounting Plan

High-level plan for the money-in side of Base Camp: invoicing and payment
tracking for what Ridge is owed on a booking. Companion to
`docs/outreach-engine-plan.md` (which covers discovery and outreach) but a
separate concern and a separate doc on purpose -- worked out across a full
planning conversation before any of it gets built, same convention as that
doc, and kept in sync the same way (see "Keeping this in sync" below).

Status as of this document: plan settled for the first build target
(booking-commission invoicing), pre-build. Everything else below is
direction, not yet locked in.

## 1. Vision

Base Camp already tracks the deal (the `plays` pipeline) and the paperwork
(contract generation + e-signature via SignWell). This plan is the third
leg: once a play is booked, who owes Ridge money, how much, and has it
actually been paid. Scope is deliberately narrow -- **money in**, nothing
else. Expenses, payroll, P&L, and taxes are explicitly not part of this
plan; see section 2.

## 2. Locked in

- **Money-in only.** Invoicing and payment tracking for what Ridge is owed.
  Broader business accounting (expenses, P&L, taxes) stays out of Base
  Camp entirely -- Greg's call: that's commodity territory with mature
  tools already built for it (QuickBooks Online or similar), not worth
  reinventing. If this plan ever needs to hand data to that side (e.g. an
  income category for a paid invoice), that's a future bridge, not
  something this plan builds.
- **Active pipeline only, not the historical backlog.** `plays` already
  has `deposit_amount`, `deposit_due_date`, `deposit_status`, and
  `final_payment_received` -- live, editable fields on the Play detail
  page, and `deposit_amount`/`deposit_due_date` are already pulled into
  the generated contract document for every new play (`contractData.ts`).
  But `deposit_status` and `final_payment_received` are free-text fields,
  and the historical data in them (526 rows, mostly from the spreadsheet
  import) is genuinely messy -- `"Received via Venmo (03/04/2025)"`,
  `"Paid to Cody (03/04/2023)"`, `"Lost in Mail"`, `"203"` (a typo for
  2023), `"X"`, `"??"`, bare dollar amounts with no label. Per Greg:
  design this around new/active plays going forward; no retrofit sweep of
  that history. The old fields stay as-is and keep rendering for
  historical plays; nothing here requires migrating or cleaning them.
- **First build target: Ridge invoices the artist for Ridge's booking
  commission.** Not the buyer, not management commission -- both are
  explicitly deferred (see section 6). Confirmed business model: the
  buyer pays the artist the guarantee directly (today's norm) or
  increasingly pays a deposit to Ridge's own account, which Ridge later
  settles with the artist -- either way, Ridge's own cut (booking
  commission, `plays.booking_agent_commission_amount`) is what Ridge
  needs to invoice *the artist* for and collect, independent of exactly
  how the buyer's money moves. Building the invoice-the-artist piece
  first means the design doesn't have to wait on settling the buyer-side
  question.
- **Invoice generation/sending goes through QuickBooks Online, not
  built natively.** Same reasoning as the e-signature decision
  (SignWell): invoicing an external party, collecting payment, and
  knowing when it's actually been paid is a solved problem with real
  infrastructure behind it (payment rails, reconciliation, receipts) --
  not something to rebuild from scratch. Base Camp owns the data (who
  owes what, for which play, has it been paid) and the trigger (create
  the invoice when a play is ready); QBO owns sending it, collecting
  payment, and being the system a human actually watches money arrive in.
  A webhook closes the loop back to Base Camp. This mirrors the
  `SignatureProvider` pattern in `src/lib/signature/` exactly: a narrow,
  swappable interface in Base Camp, the actual provider's SDK/API
  confined to one file, nothing elsewhere in the app talking to QBO
  directly.
- **QBO webhooks can do this.** Checked before committing to this
  design, not assumed: QBO's webhook system fires on Invoice entity
  changes (Create/Update/Delete/Merge/Void) and on Payment creation. The
  payload is thin -- entity name, id, operation, timestamp, no
  field-level detail -- so "did this invoice get paid" requires a
  follow-up API call to fetch the invoice and check its balance, same
  shape as the existing SignWell webhook route (notification in, fetch
  full state from the provider, update the local record). Setup is
  OAuth2 + a registered Intuit developer app + a public HTTPS endpoint
  with signature verification (`intuit-signature` header, HMAC-SHA256
  against a Verifier Token) -- same bones as `/api/webhooks/signwell`,
  new route `/api/webhooks/quickbooks`.

## 3. Where this actually starts

Neither precondition exists yet, confirmed with Greg:

- **No QBO account yet.** Getting one (and registering a developer app
  against it, starting in QBO's sandbox) is step one, before any
  integration code gets written. Not this plan's job to pick a QBO
  subscription tier -- that's Greg's call, informed by whatever he
  decides for the expenses/taxes side too, since it'll be the same
  account either way.
- **Artists aren't tracked as billable entities anywhere today.** No
  QBO customer/vendor records, no accounting-system presence at all.
  Part of getting this running is deciding how each artist becomes a QBO
  Customer -- created automatically by Base Camp via the API the first
  time that artist needs an invoice, or set up by hand in QBO first and
  matched by Base Camp after. Leaning toward automatic (matches how
  companies/contacts already get auto-created from fuzzy-matched
  fallbacks elsewhere in this codebase -- see `submit_offer_inquiry` in
  `docs/db-schema-tracking-gaps.md` for the established pattern), but not
  decided -- see section 7.

## 4. Data model (draft)

One new table, `commission_invoices`, modeled directly on
`contract_signatures` (same provider-integration shape: a provider name,
a provider-side id, a status, timestamps for the real lifecycle events, a
raw-events audit log, not reusing `contract_signatures` itself since an
invoice and a signature request are different objects with different
lifecycles, even though the integration pattern is identical):

| Column | Purpose |
|---|---|
| `id` | PK. |
| `play_id` | The play this commission was earned on. |
| `kind` | `'booking'` (built first) or `'management'` (deferred, see section 6) -- so the table doesn't need a second one later when management invoicing gets designed. |
| `artist_id` | Who's being invoiced -- denormalized off the play for easy querying, same reasoning `outreach_log.artist_id` already uses. |
| `amount` | The commission amount at invoice time (`plays.booking_agent_commission_amount` as of creation -- captured, not re-read live, same reasoning `action_items.occurrence_date` is captured rather than live-joined). |
| `provider` | `'quickbooks'` today; exists so a future provider swap doesn't need a schema change, same as `contract_signatures.provider`. |
| `provider_invoice_id` | QBO's invoice id. |
| `provider_customer_id` | QBO's Customer id for the artist (see section 3 on how that gets created/matched). |
| `status` | `draft` / `sent` / `paid` / `voided` -- mirrors QBO's own invoice lifecycle rather than inventing a parallel one. |
| `sent_at` / `paid_at` / `voided_at` | Real lifecycle timestamps, same convention as `contract_signatures`. |
| `provider_events` | jsonb, raw webhook payloads, same audit-trail reasoning as `contract_signatures.provider_events`. |
| `created_at` / `updated_at` | Standard. |

Not yet decided: whether `plays.status` gets any automatic tie-in to this
(e.g. does a paid booking-commission invoice do anything to the play's
Kanban stage, the way `signwell`'s webhook already can) -- see section 7.

## 5. Provider interface (draft)

A `QuickBooksProvider` (or similarly named) interface in a new
`src/lib/invoicing/` directory, deliberately narrow, same spirit as
`src/lib/signature/types.ts`'s own comment about scope: don't model every
QBO feature, just what's actually needed --

- `createInvoice(input)` -- artist (creating/matching the QBO Customer
  first if needed), amount, play/commission description, returns the
  provider invoice id.
- `getInvoice(providerInvoiceId)` -- fetch current state (balance, so a
  webhook's thin payload can be resolved to "is this actually paid now").
- `verifyWebhookSignature` / `parseWebhookEvent` -- same two-step shape as
  the signature provider: verify before trusting, then normalize to
  something Base Camp's webhook route can act on.

Everything else in the app (wherever "create a commission invoice" gets
triggered from) talks to this interface, never to QBO's SDK/REST API
directly -- confined to one file, so swapping providers later (unlikely,
but the SignWell precedent is exactly why this seam exists) means writing
a new file and flipping a config value, not touching call sites.

## 6. Explicitly deferred

- **Management-commission invoicing.** Same mechanism should work (the
  `kind` column above is there for this), but Greg wants booking proven
  out first before deciding how management commission gets invoiced --
  possibly different timing, possibly a different recipient. Revisit
  once booking invoicing is live and working.
- **Buyer-side deposit invoicing.** The "Ridge collects the deposit
  directly from the buyer, settles with the artist afterward" flow Greg
  described as the direction things are heading, but explicitly "a bit
  of a future state" -- today it can still go either way (buyer pays
  artist directly, or pays Ridge a deposit). Not designing this until the
  booking-commission piece is proven and the real pattern has stabilized.
- **Expenses, payroll, P&L, taxes.** Out of Base Camp entirely -- see
  section 2. QBO (once set up) is assumed to handle this side natively;
  no Base Camp feature is planned to feed it, though a future bridge
  isn't ruled out.
- **Retrofitting the messy historical `deposit_status`/
  `final_payment_received` free text.** See section 2 -- new/active plays
  only, for now.

## 7. Still open, to resolve during build

- Does creating a QBO Customer for an artist happen automatically (first
  invoice triggers it) or does Greg set artists up in QBO by hand first?
- Does a paid booking-commission invoice do anything automatically to the
  play's status/Kanban stage, or is it purely a parallel, informational
  record for now?
- Who/what triggers `createInvoice` -- a manual action Greg takes on the
  Play detail page (a "Send commission invoice" button, matching how
  contract sending already works), or something automatic tied to a
  status change (e.g. the play reaching `played` or `settled`)? Leaning
  toward manual-first, matching how e-signature sending itself started,
  but not decided.
- QBO subscription tier/account setup itself -- Greg's call, outside this
  plan's scope to pick.
- Whether `amount` should be able to differ from
  `plays.booking_agent_commission_amount` at invoice time (e.g. a
  manually adjusted figure) or should always exactly mirror it.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc -- same rule as
`docs/outreach-engine-plan.md`.
