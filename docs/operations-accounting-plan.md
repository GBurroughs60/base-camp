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
  explicitly deferred (see section 8). Confirmed business model: the
  buyer pays the artist the guarantee directly (today's norm) or
  increasingly pays a deposit to Ridge's own account, which Ridge later
  settles with the artist -- either way, Ridge's own cut (booking
  commission, `plays.booking_agent_commission_amount`) is what Ridge
  needs to invoice *the artist* for and collect, independent of exactly
  how the buyer's money moves. Building the invoice-the-artist piece
  first means the design doesn't have to wait on settling the buyer-side
  question.
- **Commission formula, updated to include Walkout (2026-10-26).**
  `computePlayRevenue` already does the right thing with merch -- booking
  commission is `guarantee_amount × booking%` only, management commission
  is `(guarantee_amount + gross_merch_sales) × management%` -- merch was
  already excluded from booking, included only in management, confirmed
  by reading the function rather than assumed. The new post-show actual,
  **Walkout** (see section 4 -- the artist's real bonus/overage beyond
  guarantee, a field that doesn't exist in the schema yet), gets added to
  *both* bases per Greg: booking becomes
  `(guarantee_amount + walkout_amount) × booking%`, management becomes
  `(guarantee_amount + walkout_amount + gross_merch_sales) × management%`.
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
  decided -- see section 9.

## 4. Settlement data collection (2026-10-26)

**Trigger: the existing `played` auto-advance, nothing new.** A play
already flips from `confirmed` to `played` the day after `show_date`
passes, via the daily `advance_confirmed_plays_to_played` cron -- no new
pipeline stage needed for "the show happened." Settlement data
collection hangs off that existing event.

**What's needed, and what already exists.** Checked the schema before
assuming anything was missing:

- `attendance` (integer) and `tickets_sold`/`gross_revenue` (the latter
  two auto-computed from `actual_ticket_tiers` by an existing DB trigger,
  `sync_actual_ticket_tiers_totals`) already exist and are already live,
  editable fields on the Play detail page. `gross_revenue` is box-office
  ticket revenue specifically, not artist payout -- a venue-side number.
  `gross_merch_sales` also already exists and is already live-editable.
  So most of the venue-side and some of the artist-side data this plan
  needs is *already* real, wired-up schema -- not new.
- **Genuinely new: `walkout_amount`.** No field anywhere today captures
  the artist's actual bonus/overage beyond the guarantee -- what Greg
  calls **Walkout**. New column on `plays`, artist-reported, post-show.
  Commissioned on both booking and management (see section 2's formula
  update).
- **Deferred, noted for later: "Walkout Potential."** A future,
  pre-show, offer-stage projected-upside field for pitching deals to
  management -- explicitly a different thing from the post-show actual
  Walkout above, not designed or built as part of this plan.
- **Retiring `amount_due_to_agency`.** An existing live-editable field
  that was the spreadsheet-era manual way of recording what Ridge was
  owed -- redundant once a real computed total and a real invoice amount
  exist. Per Greg: quietly retire it for new plays going forward (stop
  surfacing it on the Play detail page for anything created after this
  ships); leave the column and its historical data alone, same
  active-pipeline-only convention as section 2.

**Manual entry UI.** A new "Settlement" section on the Play detail page,
same pattern as the existing Deposit section, but structured fields from
the start rather than the free-text mess `deposit_status`/
`final_payment_received` turned into: `walkout_amount`, plus the
already-existing `attendance`/`gross_merch_sales`/ticket-tier actuals
surfaced in the same place rather than scattered. No OCR/auto-extraction
of the artist's or venue's paperwork -- Greg types in whatever the
paperwork says, same as every other manually-entered field in this app.

**Venue-side collection: a `/book`-style form, with manual entry always
accepted too.** Per Greg: attempt to collect venue-reported numbers
(final ticket counts, payout confirmation -- most relevant for ticketed
shows) through a structured intake form, same spirit as the public
`/book` offer form, sent to/used by the venue contact after the show. But
explicitly not the only path -- venues vary too much in practice (some
will never use a form, especially non-ticketed bookings), so manual entry
by Greg is always an accepted fallback into the same fields. Not designed
yet -- see section 9.

**The invoice trigger is gated on the artist's data only, never the
venue's.** Per Greg: "build a culture of trust and have more leverage" to
get real numbers from the artist reliably; venue data may simply never
arrive for a non-ticketed booking, and making the invoice wait on it
would block real revenue on something outside Ridge's control. Venue-
reported numbers still get stored when they do come in (useful as a
cross-check against what the artist reports), but never block anything.
Exactly how a discrepancy between artist- and venue-reported numbers gets
surfaced, if at all, isn't designed yet -- see section 9.

**Reuses the Action List, no second reminder system.** The moment a play
hits `played`, an auto Action List item appears ("Collect settlement --
[Artist] at [Venue]"). It clears once the Settlement section is filled
in, which is the same event that triggers the auto-invoice -- one
mechanism doing both the nudge and the unblock, not two parallel systems.

## 5. Revenue dashboard: Forecasted / Earned / Collected (2026-10-26)

Replaces the Booked/Earned/Settled model documented in
`docs/outreach-engine-plan.md` section 13 -- **that section needs
updating once this ships**, per this doc's own sync rule below.

- **Forecasted** -- no `commission_invoices` row yet for this play. Still
  the guarantee-based estimate (today's existing formula, now including
  merch/walkout once known). Covers every pre-`played` status plus
  `played` itself until settlement data comes in.
- **Earned** -- a `commission_invoices` row exists and has been sent
  (`sent_at` populated). The real number, computed from actual
  guarantee + walkout + merch, not the estimate.
- **Collected** -- that invoice has actually been paid (`paid_at`
  populated, confirmed via the QBO webhook). The real paid amount, which
  is allowed to differ from the invoiced amount (see `paid_amount` in
  section 6) even though in the ordinary case they'll match.

**Deliberately not a new pipeline stage.** Earlier draft of this
conversation proposed an `invoiced` status between `played` and
`settled`; Greg pushed back, and the better answer is to let
`commission_invoices` carry its own lifecycle the same way
`contract_signatures` already does, rather than growing `plays.status`
for every financial nuance. The Kanban pipeline stays exactly as simple
as Greg's original ask: `played` -> `settled`, with `settled` triggered
automatically the moment QBO confirms the invoice paid -- the dashboard
reads Forecasted/Earned/Collected off the invoice table's state, not off
the Kanban column.

**"Invoice sent" badge on the Play card/record (approved by Greg).** The
one real gap the no-new-stage approach leaves: the board itself can't
visually tell "played, nothing collected yet" apart from "played,
invoice's out, waiting on payment" -- both just sit in the `played`
column. Fixed with a small badge on the card (e.g. "Invoice sent"),
sourced from `commission_invoices.sent_at` being set with no `paid_at`
yet -- purely cosmetic, no new column, no new filter/grouping logic.

## 6. Data model (draft)

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
| `kind` | `'booking'` (built first) or `'management'` (deferred, see section 8) -- so the table doesn't need a second one later when management invoicing gets designed. |
| `artist_id` | Who's being invoiced -- denormalized off the play for easy querying, same reasoning `outreach_log.artist_id` already uses. |
| `amount` | The real commission amount at invoice time, computed from the actual post-show Walkout/merch/guarantee (section 2's updated formula) once settlement data exists -- captured, not re-read live, same reasoning `action_items.occurrence_date` is captured rather than live-joined. This is the dashboard's **Earned** number (section 5). |
| `paid_amount` | The real amount QBO reports as actually paid, set once the webhook confirms payment. Deliberately a separate column from `amount` rather than assumed equal -- this is the dashboard's **Collected** number (section 5), and the two are allowed to genuinely differ (partial payment, an adjustment, etc.) even though they'll match in the ordinary case. |
| `provider` | `'quickbooks'` today; exists so a future provider swap doesn't need a schema change, same as `contract_signatures.provider`. |
| `provider_invoice_id` | QBO's invoice id. |
| `provider_customer_id` | QBO's Customer id for the artist (see section 3 on how that gets created/matched). |
| `status` | `draft` / `sent` / `paid` / `voided` -- mirrors QBO's own invoice lifecycle rather than inventing a parallel one. |
| `sent_at` / `paid_at` / `voided_at` | Real lifecycle timestamps, same convention as `contract_signatures`. |
| `provider_events` | jsonb, raw webhook payloads, same audit-trail reasoning as `contract_signatures.provider_events`. |
| `created_at` / `updated_at` | Standard. |

**Resolved (see section 5): `plays.status` does get an automatic
tie-in, but only one.** `settled` is triggered automatically the moment
`paid_at` gets set -- the one Kanban change in this whole plan, matching
Greg's original ask exactly. Nothing else about `plays.status` changes;
Forecasted/Earned/Collected read off this table's own lifecycle, not off
a new Kanban stage (an earlier draft of this conversation proposed one;
rejected -- see section 5 for why).

## 7. Provider interface (draft)

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

## 8. Explicitly deferred

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
- **"Walkout Potential."** A pre-show, offer-stage projected-upside
  field, for use when pitching a deal to management -- see section 4.
  Explicitly a different, later thing from the post-show actual Walkout
  this plan does build.
- **Expenses, payroll, P&L, taxes.** Out of Base Camp entirely -- see
  section 2. QBO (once set up) is assumed to handle this side natively;
  no Base Camp feature is planned to feed it, though a future bridge
  isn't ruled out.
- **Retrofitting the messy historical `deposit_status`/
  `final_payment_received` free text.** See section 2 -- new/active plays
  only, for now.

## 9. Still open, to resolve during build

- Does creating a QBO Customer for an artist happen automatically (first
  invoice triggers it) or does Greg set artists up in QBO by hand first?
- The exact venue-side settlement form -- a `/book`-style structured
  intake is the direction (section 4), but not designed: what fields,
  how it's delivered to the venue contact (emailed link? included in the
  original booking correspondence?), and whether it's scoped to ticketed
  shows only or offered for every booking.
- Whether/how a discrepancy between artist-reported and venue-reported
  settlement numbers gets surfaced, if venue data ever comes in and
  disagrees with what the artist reported (section 4) -- silently stored
  for reference, or actively flagged somewhere?
- QBO subscription tier/account setup itself -- Greg's call, outside this
  plan's scope to pick.
- Whether `commission_invoices.amount` should be editable/adjustable
  after creation (e.g. Greg catches an error before the invoice is sent)
  or should always exactly mirror the formula's output once computed.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc -- same rule as
`docs/outreach-engine-plan.md`.
