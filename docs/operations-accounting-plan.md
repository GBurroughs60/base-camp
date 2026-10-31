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
  **Amended 2026-10-31:** the settlement-collection form (section 4) also
  captures a small set of non-financial, booking-intelligence fields
  (other events in town, promoter notes, a rebook recommendation)
  alongside the money-in data -- a deliberate, scoped exception to keep
  post-show data collection to one touchpoint, not a broadening of this
  plan's financial scope.
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

**Sequencing, clarified (2026-10-27).** The two preconditions above block
only the *QBO integration code* -- `createInvoice`/`getInvoice`, the
webhook route, actually calling out to QBO. They don't block starting
section 4 (settlement data collection): the `walkout_amount` column, the
new Settlement section on the Play detail page, retiring
`amount_due_to_agency`, and the Action List nudge are all pure Base Camp
schema/UI work with zero QBO dependency. In practice, settlement data
collection is the truer near-term build priority -- it's where the real
open design questions live (section 9: the venue-form shape, discrepancy
handling), it delivers value on its own (real settlement numbers visible
on the Play record, independent of invoicing), and it can start whenever
Greg's ready regardless of where the QBO account stands. QBO account
setup is comparatively small and can happen in parallel at Greg's own
pace; the two threads only need to converge once it's time to actually
wire up `createInvoice`.

## 4. Settlement data collection (2026-10-26, mechanism settled 2026-10-31)

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

**Naming, settled against a real example (2026-10-31).** A real historical
artist show report (a PDF Greg has used for years) surfaced a naming
collision worth recording: that report's "Net Walkaway" field is gross
pay *minus* day-of expenses (a deduction), not the same concept as
Walkout at all (overage *above* the guarantee). The new intake form
(below) avoids that ambiguity by never asking for one combined number: it
shows the artist their **Guarantee** back (Base Camp already knows it,
read-only) and asks only for the delta, framed to the artist as
"Guarantee plus back end" -- which writes directly and unambiguously into
`walkout_amount`. `gross_merch_sales` stays a single total; per Greg, no
hard/soft split, not worth the added structure.

**Manual entry UI.** A new "Settlement" section on the Play detail page,
same pattern as the existing Deposit section, but structured fields from
the start rather than the free-text mess `deposit_status`/
`final_payment_received` turned into: `walkout_amount`, plus the
already-existing `attendance`/`gross_merch_sales`/ticket-tier actuals
surfaced in the same place rather than scattered. No OCR/auto-extraction
of the artist's or venue's paperwork -- Greg types in whatever the
paperwork says, same as every other manually-entered field in this app.
This section is also where a manual submission lands when the artist
doesn't use the form below (see "Collection mechanism").

**One unified post-show report, not split by concern (2026-10-31, per
Greg).** Collected in a single form, single moment, single touchpoint --
not a separate financial ask and a separate qualitative one. Alongside
the settlement fields that feed the invoice (`walkout_amount`,
`gross_merch_sales`, `attendance`, `tickets_sold`), the same form also
collects booking-intelligence fields that don't feed any financial number
but matter for rebooking decisions: "other events in town," promoter-
specific comments (distinct from general show notes, which already have
a home in `plays.notes`), and "would you play this venue again?" ("Other
acts on the bill" already has a home too -- `plays.other_artists_on_bill`,
existing field, nothing new needed there.) See section 2's amendment for
why this is in scope here.

**"Would you play this venue again?" is a structured three-way choice,
not yes/no (2026-10-31, per Greg).** Yes / No / With reservations --
decisive and still trivially filterable, but wide enough to hold the
honest answer for the extremely common real case ("great room, bad
money," "good money, terrible sound") without forcing a false binary or
getting skipped. The *why* behind a "with reservations" or a "no" isn't
this field's job -- that's what `promoter_notes`/`notes` right next to it
are for, same split as everywhere else on this form: the verdict stays
dry and queryable, the reasoning stays in prose. This is the artist's own
per-show answer, not an automatic rollup to anything persistent on the
venue/company record -- see section 9. Reasoning: realistically one shot at the
artist's attention right after a show -- asking twice (once for Ridge's
money, once for Ridge's own judgment) means asking twice for something
naturally answered once.

**New: an optional, structured Expenses tracker.** Day-of expenses the
artist paid out of pocket (sound engineer tips, etc. -- what the old
PDF's "Net Walkaway" was actually capturing) get their own repeatable
list, same interaction pattern as the existing ticket-tier editor
(`src/lib/ticketTiers.ts` / `TicketTierEditor.tsx`): a "+" to add a row,
each row an expense label, an amount, and an optional note. New jsonb
column, `settlement_expenses`, same shape convention as
`actual_ticket_tiers` (there: label/price/quantity; here:
label/amount/note). Purely informational -- never feeds the commission
formula (section 2), which only ever adds guarantee + walkout + merch.

**New: weather, fully automated, zero data entry.** Fetched from
[Open-Meteo](https://open-meteo.com/)'s free historical-weather API (no
key required -- confirmed current as of this conversation) using the
play's own `show_date`/`city`/`state`, no artist or Greg involvement at
all. New column, `weather_summary`.

**Collection mechanism: a token-scoped form, modeled directly on
`/approve/[token]` -- "public" means no login wall, not open access
(2026-10-31, clarified per Greg).** New route, `/settle/[token]`. Worth
being precise about what "public" means here, since the word is
misleading: this route needs no Base Camp login (the artist/manager have
none), but it is not reachable by guessing a URL or browsing anything --
access is gated entirely by possessing the token itself, a
server-generated `crypto.randomUUID()` (122 bits of randomness, same as
`plays.approval_token` already is), sent only inside the settlement
email. Calling it "the public form" going forward undersells that; in
writing and in conversation, call it the token-scoped settlement link.

The actual access-control mechanism, mirrored exactly from
`/approve/[token]`'s already-proven design (`get_play_approval_summary`
/ `respond_to_play_approval`, see `app/actions/approval.ts`), answers all
three of Greg's requirements (2026-10-31):

- **No stray access from outside the intended group.** RLS on `plays`
  (and every related table) stays authenticated-only -- the anon role
  gets zero direct table access, full stop. Two new `SECURITY DEFINER`
  functions, `get_settlement_summary(p_token)` and
  `submit_settlement_report(p_token, ...)`, are the *only* crack the anon
  role gets, and each is scoped to a single play by the token, never by
  an attacker-suppliable id. Even someone who obtained the anon key
  directly (it's not secret -- it ships to the browser) couldn't browse
  or enumerate plays through it; they could only call these two
  functions, and only ever learn anything by already possessing a valid
  token. The token itself only ever reaches two inboxes: the artist-role
  and manager-role contacts on that play, via the Resend email -- never
  logged anywhere a third party could find it, never derivable from the
  play id.
- **From the artist or their rep, nobody else, without pretending to
  verify identity.** The page shows a "who's submitting?" picker scoped
  to exactly the contacts the email went to (mirrors
  `responderOptions`/`ResponderFields` on the approve page precisely),
  plus a free-text fallback for the forwarded-email case. This isn't an
  identity check -- anyone with the link could type any name -- it's the
  same tradeoff the approval flow already makes for Guarantee/deal-terms
  data today, extended to settlement data at the same trust level, not a
  new or weaker one.
- **Exactly once, never duplicate.** `settlement_submitted_at` is the
  single source of truth, mirroring `approval_responded_at`. The RPC's
  write is guarded by `WHERE settlement_submitted_at IS NULL` -- a
  database-level compare-and-swap, not just a UI check, so even the
  artist and manager both submitting at the same moment only ever
  accepts the first. Once set, the page shows an "Already submitted"
  state instead of the form (mirrors `AlreadyResponded`) -- there's no
  second write path in the UI, and the RPC itself refuses a second write
  even on a direct replay of the POST. There's also only ever one token
  per play, sent in one email to both recipients together, not a
  separate link per person -- nothing to desync in the first place.
- **One more hardening detail carried over from the approve page's own
  comment:** the page itself must never write on a GET -- some corporate
  email/security tools pre-fetch every link in an inbound email to scan
  it, which would falsely "submit" an empty report if the link itself
  did the writing. Render-only on load; the actual `submit_settlement_report`
  call only fires from a real POST on button-press, same as
  `approveOffer`/`declineOffer`.

**Build note:** the new `SECURITY DEFINER` functions are very likely to
hit the same auto-mode block the `submit_offer_inquiry` redefinition and
the `plays` columns migration both hit (see
`docs/db-schema-tracking-gaps.md`) -- that tooling treats any
`SECURITY DEFINER` function change as sensitive regardless of size, so
plan on Greg applying this one directly too.

Manual entry by Greg on the Play detail page's Settlement section remains
the fallback either way -- same fields, same UI, whether the artist's
form submission fills them or Greg types them in directly, matching the
"never block on something outside Ridge's control" principle already
established for the venue side below.

**Delivery: automatic email via Resend, modeled on `sendApprovalEmail`
(2026-10-31, per Greg).** Same provider and conventions already in
`src/lib/approvalEmail.ts` (escapeHtml/formatMoney helpers, try/catch-
and-log-never-throw via `email_notification_failures`, a graceful no-op
if `RESEND_API_KEY` isn't set). New function, e.g.
`sendSettlementRequestEmail`. Recipients deliberately flip the approval
email's convention: there, manager and artist are equal primary
recipients and the agent is cc'd; here, per Greg, **the artist is who's
expected to actually fill this out** (they were at the show), so
artist-role contacts (`contact_artists.role = 'artist'`) are the primary
`to`, with manager-role contacts (`role = 'manager'`) cc'd. Same
fallback-to-Greg convention as the approval email when no artist contact
with an email is on file.

**Trigger point is the cron, not a UI field edit -- different from the
approval email (2026-10-31, confirmed by reading the code).** The
approval email fires from a generic field-update handler in
`src/app/actions/records.ts`, triggered the moment someone changes
`plays.status` to `pending_approval` through the UI. `played` doesn't
work that way -- it's set in bulk, daily, by the deterministic
`advance_confirmed_plays_to_played()` Postgres function via the
`/api/cron/advance-plays-to-played` route, with no per-play UI action
involved. So the settlement email has to hook into that same cron route:
after the RPC runs, look up which plays just landed in `played` and
haven't had a settlement email sent yet, and send one per play. Needs its
own guard column, `settlement_email_sent_at`, mirroring
`approval_email_sent_at` exactly, so the cron never re-sends on a later
run. A new `settlement_token` column mirrors `approval_token`;
`settlement_submitted_at` (set the moment the settlement link is
submitted) is the same event this section already names as the
auto-invoice trigger.

**No Action List item for this (2026-10-31, supersedes the earlier draft
of this section).** The original draft proposed an auto Action List
nudge ("Collect settlement -- [Artist] at [Venue]") the moment a play hit
`played`. Per Greg, skip it -- the automatic email above *is* the
mechanism now, so there's nothing left for Greg to be nudged to go do.
(The near-term-vs-permanent caution from the original 2026-10-27 draft
doesn't apply to this specific nudge anymore, since there isn't one --
though the same caution would still hold for any *other* future
ops/accounting follow-up work that might want its own queue someday.)

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

## 5. Revenue dashboard: Booked / Earned / Collected (2026-10-26, renamed 2026-10-27)

Replaces the Booked/Earned/Settled model documented in
`docs/outreach-engine-plan.md` section 13 -- **that section needs
updating once this ships**, per this doc's own sync rule below.

- **Booked** -- no `commission_invoices` row yet for this play. Still
  the guarantee-based estimate (today's existing formula, now including
  merch/walkout once known). Covers every pre-`played` status plus
  `played` itself until settlement data comes in. (Named "Forecasted" in
  the original 2026-10-26 draft of this section; Greg preferred "Booked"
  -- same tier, same definition, just the word already used for this
  exact stage in the live `revenue.ts`/today's dashboard, so this also
  removes a naming mismatch rather than creating one.)
- **Earned** -- a `commission_invoices` row exists and has been sent
  (`sent_at` populated). The real number, computed from actual
  guarantee + walkout + merch, not the estimate.
- **Collected** -- that invoice has actually been paid (`paid_at`
  populated, confirmed via the QBO webhook). The real paid amount, which
  is allowed to differ from the invoiced amount (see `paid_amount` in
  section 6) even though in the ordinary case they'll match.

**Trend analytics (new, 2026-10-27, per Greg) -- a different use of
"forecast," kept deliberately distinct from the Booked stage above.**
Two additional data points for the finance dashboard, both read-only
derived numbers, not new `commission_invoices` states:

- **Rolling 90-day revenue.** A trailing actual: sum of Collected
  dollars (section 6's `paid_amount`, by `paid_at`) over the most recent
  90 days. A real, already-happened number -- the closest thing this
  dashboard has to "how is the business doing right now."
- **Forecasted 12-month revenue.** A simple trend projection, not a
  deal-by-deal estimate: take the rolling 90-day figure above, treat it
  as a quarterly run rate, and project it forward across a 12-month span
  (i.e. roughly 4x the rolling 90-day number, naively -- no seasonality
  adjustment, no pipeline-specific detail). Deliberately the simplest
  version of this that's still useful; a more sophisticated model (e.g.
  blending in Booked-stage guarantees for deals already on the books) is
  a future refinement, not required for v1.

Both are presentation-layer additions to the existing dashboard -- no
new table, no new `plays`/`commission_invoices` column. Computed from
`commission_invoices.paid_at`/`paid_amount` once that table exists;
until then (today, pre-build) there's nothing to roll up yet.

**Deliberately not a new pipeline stage.** Earlier draft of this
conversation proposed an `invoiced` status between `played` and
`settled`; Greg pushed back, and the better answer is to let
`commission_invoices` carry its own lifecycle the same way
`contract_signatures` already does, rather than growing `plays.status`
for every financial nuance. The Kanban pipeline stays exactly as simple
as Greg's original ask: `played` -> `settled`, with `settled` triggered
automatically the moment QBO confirms the invoice paid -- the dashboard
reads Booked/Earned/Collected off the invoice table's state, not off
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

**New `plays` columns for section 4 (draft, 2026-10-31).** Listed here so
the full data model is in one place; the exact migration still needs its
own separate approval before anything gets built, same as every schema
change in this plan.

**Build status (2026-10-31).** Manual-entry UI shipped. The migration
above (all nine columns) hit the same auto-mode production-deploy block
`submit_offer_inquiry` hit earlier (see
`docs/db-schema-tracking-gaps.md`) -- Greg applied it directly via the
Supabase SQL editor, so it's live but untracked (logged there, with the
replay SQL, same as that earlier gap). With the columns confirmed live:
`records.ts` now whitelists the five scalar fields
(`walkout_amount`/`weather_summary`/`other_events_in_town`/
`promoter_notes`/`would_play_again`) plus the already-built
`updateExpenseField`/`settlement_expenses` plumbing from the first pass.
The Play detail page's "Box Office" card is renamed **Settlement** and now
holds: Walkout (with a note pointing back at Guarantee on the Deal card),
the existing attendance/tickets/revenue/merch/band% fields and actual
ticket tiers unchanged, the new Expenses tracker (`ExpenseField`, wired
in), and a "Post-show report" block (Weather, Other events in town,
Promoter notes, Would play again -- the Yes/No/With-reservations select).
Type-checks, lints, and a full `next build` all clean (one unrelated
prerender failure on `/login` from missing Supabase env vars in this
sandbox, nothing to do with this change).

Weather is manual-entry only for now, noted as such in the UI -- the
auto-fetch from Open-Meteo is still a later pass. Still queued after this:
the token-scoped `/settle/[token]` settlement link, the Resend email
(`sendSettlementRequestEmail`), and the cron hook into
`advance-plays-to-played` (all of section 4 above under "Collection
mechanism" / "Delivery" / "Trigger point").

| Column | Purpose |
|---|---|
| `walkout_amount` | Already named in section 4 -- artist-reported overage beyond the guarantee. |
| `settlement_token` | Unguessable `crypto.randomUUID()` for the `/settle/[token]` link, mirrors `plays.approval_token`. Not a "public" credential -- see the access-control note above. |
| `settlement_email_sent_at` | Guards the settlement-email cron hook against re-sending, mirrors `approval_email_sent_at`. |
| `settlement_submitted_at` | Set when the settlement link is submitted (or Greg finishes manual entry) -- the auto-invoice trigger event. |
| `settlement_expenses` | jsonb, repeatable label/amount/note rows, same shape convention as `actual_ticket_tiers`. |
| `weather_summary` | Auto-fetched, no manual entry -- see section 4. |
| `other_events_in_town` | Booking-intelligence field from the unified post-show report. |
| `promoter_notes` | Distinct from general `plays.notes` -- see section 4. |
| `would_play_again` | Rebook recommendation -- `'yes'` / `'no'` / `'with_reservations'`, structured, not free text (see section 4). See section 9 for where this should actually live long-term. |

**Resolved (see section 5): `plays.status` does get an automatic
tie-in, but only one.** `settled` is triggered automatically the moment
`paid_at` gets set -- the one Kanban change in this whole plan, matching
Greg's original ask exactly. Nothing else about `plays.status` changes;
Booked/Earned/Collected read off this table's own lifecycle, not off
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
- Where "would you play this venue again?" actually lives (2026-10-31).
  It's captured per-play on the settlement form (section 4), but is a
  per-play answer the right home for it, or should a "yes"/"no" also
  update something persistent on the venue/company record -- which is
  presumably where an actual future rebooking decision gets made, not by
  paging back through past plays? Not designed.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc -- same rule as
`docs/outreach-engine-plan.md`.
