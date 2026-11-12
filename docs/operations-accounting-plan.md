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
- **Commission formula, updated to include Walkout (2026-10-26), then
  corrected (2026-11-11) -- see the amendment at the end of section 6 for
  the full story.** Net result, current as of 2026-11-11: booking
  commission is `settled_basis × booking%`, management commission is
  `(settled_basis + gross_merch_sales) × management%`, where
  `settled_basis` is `walkout_amount` when it's known, else
  `guarantee_amount` -- **never both summed.** Walkout is the real,
  reconciled/settled amount between artist and venue at the end of the
  night; once it's known, it *is* the commissionable number. The
  guarantee is only a pre-show estimate, used as the basis solely in the
  absence of a Walkout figure. (The original 2026-10-26 version of this
  decision had booking as `(guarantee_amount + walkout_amount) ×
  booking%` -- i.e. summing both -- which Greg caught as wrong on
  2026-11-11: see section 6.) Each leg (booking/management) is still
  computed at most once per play, and only when it actually applies to
  that artist (`ridge_books` / `ridge_manages`) -- confirmed by reading
  `computePlayRevenue`, not assumed.
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

  **Checked (2026-10-31): the QBO subscription tier doesn't gate any of
  this.** Greg asked directly whether any tier would block the API/webhook
  features this plan needs. Researched rather than assumed (two
  independent, mutually-consistent 2026 sources -- Intuit's own developer
  help-center articles wouldn't render for a fetch, so this isn't a
  first-party quote, but both secondary sources agree in specific,
  matching detail: [Truto, "How Much Does the QuickBooks API Cost?"](https://truto.one/blog/how-much-does-the-quickbooks-api-cost-2026-pricing-rate-limits/),
  [Apideck, "QuickBooks API Pricing and the Intuit App Partner Program"](https://www.apideck.com/blog/quickbooks-api-pricing-and-the-intuit-app-partner-program)).
  Two separate axes, neither of which blocks this plan:
  - **QBO's own subscription tier** (Simple Start / Essentials / Plus /
    Advanced -- what Ridge pays Intuit for the company file) gates
    in-product accounting features (Classes/Locations on Plus+ only,
    custom-field counts, user counts, inventory, budgeting) -- not API or
    webhook access. The Accounting API's core entities (Invoice, Customer,
    Payment -- everything `createInvoice`/`getInvoice`/the webhook route
    need) and webhook subscriptions work identically on every tier,
    including Simple Start. One real implication for Greg's choice,
    unrelated to this plan: if he ever wants revenue broken out by artist
    or venue *inside QBO itself* (Classes/Locations), that needs Plus or
    Advanced -- otherwise the tier choice can be made purely on
    bookkeeping needs.
  - **Intuit's separate App Partner Program** (what *Base Camp's own
    registered developer app* is enrolled in, independent of Ridge's QBO
    plan) splits API calls into "Core" (writes -- creating/updating an
    invoice) and "CorePlus" (reads -- fetching an invoice to check if it's
    paid, which the webhook handler needs as its follow-up call, same
    shape as the SignWell webhook). Core calls are free and unmetered on
    every partner tier. The free "Builder" tier ($0/mo) includes 500,000
    CorePlus credits/month -- at Ridge's actual volume (a handful to a few
    dozen invoices a month) this isn't remotely close to that cap, so no
    paid partner tier is needed to run this. The paid tiers (Silver/Gold/
    Platinum) exist for apps selling to many other companies at volume
    and gate a few things this plan has no use for anyway (Projects,
    Sales Tax, Time w/ Payroll "Premium APIs").

  Net: Greg can pick whichever QBO subscription tier suits Ridge's actual
  bookkeeping (Classes/Locations if he wants that, otherwise Simple Start
  is plenty), entirely independent of this integration -- it's unblocked
  either way. Worth a quick double-check against Intuit's own docs or
  support chat before finalizing a purchase, since the first-party pages
  wouldn't render here, but nothing in two independent current sources
  contradicts this.
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

**Naming, settled against a real example (2026-10-31, revised 2026-11-11).**
A real historical artist show report (a PDF Greg has used for years)
surfaced a naming collision worth recording: that report's "Net Walkaway"
field is gross pay *minus* day-of expenses (a deduction), not the same
concept as Walkout at all. The intake form shows the artist their
**Guarantee** back (Base Camp already knows it, read-only) for context,
then asks for `walkout_amount` directly. **Revised 2026-11-11, per
Greg:** `walkout_amount` is the full reconciled/settled total the artist
walked out with that night, excluding merch -- not a delta added on top
of the Guarantee (the original 2026-10-31 framing asked only for the
delta, "Guarantee plus back end"; see section 6's 2026-11-11 correction
for why that didn't match the commission formula and was changed). The
form's actual prompt is now "Walkout -- what was the total amount you
walked out with tonight, excluding merch?" `gross_merch_sales` stays a
single total; per Greg, no hard/soft split, not worth the added
structure.

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
  single source of truth, mirroring `approval_responded_at`. The RPC
  locks the row (`select ... for update of p`) before checking it, then
  branches -- not found / already submitted / write -- exactly the shape
  `respond_to_play_approval` already uses, rather than a bare `UPDATE ...
  WHERE settlement_submitted_at IS NULL`. Same guarantee either way (a
  second write never lands), but this is the actual mechanism built, and
  it's the established convention in this codebase, so even the artist
  and manager both submitting at the same moment only ever accepts the
  first. Once set, the page shows an "Already submitted"
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

**Build status (2026-10-31).** Built end to end: the two new
`SECURITY DEFINER` functions (`get_settlement_summary`,
`submit_settlement_report`) and the two supporting columns
(`settlement_submitted_by_contact_id`, `settlement_submitted_by_other_name`,
mirroring `approved_by_contact_id`/`approved_by_other_name`); the public
`/settle/[token]` page (`InvalidLink`/`AlreadySubmitted`/the live form,
mirroring `/approve/[token]` exactly, including the "who's reporting?"
picker and the never-write-on-GET discipline); `app/actions/settlement.ts`
(mirroring `approval.ts`); `sendSettlementRequestEmail` and
`sendSettlementReceivedEmail` in `approvalEmail.ts` (artist primary
`to`/manager `cc` on the request, closing the loop back to the booking
agent on receipt -- same fallback-to-Greg convention as every other
automated notification); the `/settle/` exemption in
`lib/supabase/middleware.ts`; and the settlement-email step in
`api/cron/advance-plays-to-played/route.ts`, which is the actual trigger
point (see the comment there for why this had to be the cron and not a
`records.ts` field-update hook -- a play reaches "played" in bulk, not
through a single UI-initiated status edit). It queries `plays` directly
for `status = 'played' and settlement_email_sent_at is null` after the
advance RPC runs, rather than threading play ids out of
`advance_confirmed_plays_to_played()`'s return value, so it also catches
a play that reached "played" some other way (e.g. a manual board drag).

As anticipated, the new `SECURITY DEFINER` functions hit the same
auto-mode block `submit_offer_inquiry` and the `plays` columns migration
both hit -- see the new entry in `docs/db-schema-tracking-gaps.md` for the
exact SQL Greg needs to run directly via the Supabase SQL editor
(`get_settlement_summary`/`submit_settlement_report` plus the two
supporting columns). Everything else above is already committed and
passes `tsc`/`eslint`/`next build`; `/settle/[token]` won't resolve a real
token until that SQL is applied.

**Where the data lives.** There's no separate settlement table -- every
field the artist submits (`walkout_amount`, `gross_merch_sales`,
`settlement_expenses`, `other_events_in_town`, `promoter_notes`,
`would_play_again`) writes straight onto the `plays` row itself, the exact
same columns the Play detail page's Settlement/Post-show report card
already reads and edits. A submission through `/settle/[token]` and a
manual edit by Greg on the play page are two different front doors to the
same columns -- nothing to sync, no second copy to reconcile.

**Reminders and escalation (2026-10-31).** Built: `send-settlement-reminders`,
a new daily cron (separate from `advance-plays-to-played` -- different
concern, different cadence, a failure in one shouldn't block the other).
For every play sitting in `played` with a settlement request sent and no
report back yet, it checks the time since the last email (the original
request, or the last reminder) against a 3-day interval and, past that,
re-sends `sendSettlementRequestEmail` with `reminder: true` (same
recipients, "Reminder:" subject/copy, same token/link -- nothing new is
minted). After 3 reminders with still nothing back, it stops nudging the
artist and sends Greg a one-time `sendSettlementEscalationEmail` instead
(`settlement_escalated_at` guards against re-escalating every day
forever) -- a play in that state needs a person to intervene, not more
automated emails. The three tracking columns this needs
(`settlement_reminder_count`, `settlement_last_reminder_sent_at`,
`settlement_escalated_at`) hit the same auto-mode production-deploy block
the very first settlement columns migration did -- see the new entry in
`db-schema-tracking-gaps.md` for the exact SQL. Added to `vercel.json`
(`0 9 * * *`, an hour after `advance-plays-to-played`); won't actually do
anything until both that SQL and the `get_settlement_summary`/
`submit_settlement_report` SQL above are applied, since this reads
`settlement_token`/`settlement_email_sent_at`, which already exist, but
also the three new columns, which don't yet.

**Backup notification on email failure (2026-10-31).** Previously, a
failed send (Resend error, or the call throwing) only ever reached
`email_notification_failures` -- a table nothing reads automatically; the
"daily health check" mentioned in that code's own comments was aspirational
framing, not a built job. Fixed by adding `alertGregOfEmailFailure` inside
`logEmailFailure` in `approvalEmail.ts` -- since every notification kind in
this app already funnels through that one function, this one change covers
all of them (approval request/response, new offer, settlement
request/received), not just settlement. It's a direct, synchronous email to
Greg over the same Resend account, sent right alongside the existing DB log
-- best-effort, not a second channel: if Resend itself is down, this alert
can fail for the same reason the original email did, same fundamental limit
as the existing "no contact on file" fallback elsewhere in this file.
"No contact on file at all" was already covered before today -- every
automated notification in this app already falls back to Greg directly
when there's no real recipient to send to, settlement included.

**Bounce/complaint detection (2026-10-31).** The gap "an email isn't on
file" didn't originally cover is: Resend can *accept* a send and report
success, then the message bounces or gets marked spam asynchronously,
after `sendXEmail` has already returned. Added `api/webhooks/resend/route.ts`,
a new webhook (Svix-signature verified via the `svix` package, same
reasoning as using a real library for anything signature-shaped) that logs
`email.bounced`/`email.complained`/`email.delivery_delayed` through the
same `logEmailFailure` path -- same table, same direct alert to Greg.
**This needs one thing from Greg that only he can do:** in the Resend
dashboard, add a webhook endpoint pointed at
`https://base-camp-lovat.vercel.app/api/webhooks/resend`, subscribed to at
least `email.bounced`, then set the signing secret it gives him as
`RESEND_WEBHOOK_SECRET` on Vercel. Without that, the route exists but
nothing calls it -- not a blocked migration, just a dashboard step outside
this repo entirely.

**Still open / known gaps, not built today:** no manual "send now" button
on the Play detail page to nudge a play outside the 3-day cycle, or to
retry after it's been escalated -- right now a play that's been escalated
just sits there until Greg follows up by hand (by design -- see above --
but worth a button eventually); no staff-facing view of
`email_notification_failures` inside Base Camp itself (it's a
database-only table today, surfaced only via the direct email alert); and
`settlement_token`/`approval_token` both still never expire, same accepted
tradeoff as the rest of this app's token-link flows, not something this
pass changed either way.

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

**Two display additions (2026-11-12, per Greg):**
- **A fourth "Total" tile**, ahead of Booked/Earned/Settled, summing all
  three stages together (`booked.total + earned.total + settled.total`).
  Deliberately the grand-pipeline-total reading Greg asked for, not an
  "actual revenue only" figure -- it mixes still-projected Booked dollars
  with confirmed Earned/Settled ones on purpose, so it reads "everything
  on the books right now," not "cash in hand." Visually distinguished
  (a tinted border/background) so it doesn't get mistaken for a fourth
  equal peer of the other three.
- **The live per-play table is capped, not unbounded.** Per Greg: a full
  running list of every booked show was going to get unwieldy fast as the
  pipeline grows. `RevenueDashboard.tsx` now shows only the first 10 rows
  of the current sort (`LIVE_TABLE_DISPLAY_CAP`), with a "Showing X of Y
  plays -- View all in Plays →" link to the existing `/plays` list (which
  already has its own filtering/sorting) for everything beyond that. No
  new page or component -- just points at the list that already does this
  job, rather than growing Revenue into a second copy of it.

**A fifth "Total Artist Revenue" tile (2026-11-12, per Greg).** Sits
alongside the "Total" (Ridge) tile above -- a for-reference top-line
figure, *not* Ridge's own commission revenue: Walkout (or the guarantee
estimate, before it's known) plus merch, summed across every filtered
live play (`computePlayRevenue`'s new `artistTopLineAmount` field; see
section 6). Deliberately a flat sum, not broken out Booked/Earned/Settled
like the Ridge tiles -- every play has a real top-line number (no
missing-rate gap is possible the way a commission leg can be missing), so
a stage split wouldn't be protecting against anything here. Also
deliberately not filterable by artist yet -- Greg: "eventually I want to
be able to filter by artist, but what we have below works perfectly for
that for now" (i.e. the live per-play table itself already lets you scan
one artist at a time) -- a dedicated per-artist filter/view is a later
pass, not part of this change.

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

**Build status (2026-11-02).** Greg authorized starting the build once
he signed up for QBO's lowest tier ("We can always bring artist specific
reporting into basecamp at a later date if desired" -- deferring the
Classes/Locations question from section 3 for good, not just for now).
Built: `src/lib/invoicing/types.ts` (the `InvoicingProvider` interface,
section 7 below) and `src/lib/invoicing/quickbooks.ts` (the full
`QuickBooksProvider` -- OAuth2 token lifecycle with auto-refresh,
Customer find-or-create, the one-time Item lookup, `createInvoice`/
`getInvoice`, webhook signature verification and event parsing), picked
via `src/lib/invoicing/index.ts`/`INVOICING_PROVIDER`, same pattern as
`getSignatureProvider()`. `src/app/api/webhooks/quickbooks/route.ts` --
mirrors the SignWell webhook's "notification in, fetch real state via
getInvoice, update the local row" shape; resolves `invoice_changed`
events straight to a `commission_invoices` row by `provider_invoice_id`,
and for `payment_received` events (which carry a Payment id, not an
Invoice id -- resolving that precisely needs a further `GET
/payment/{id}` call this hasn't been built/tested against a real account
yet) re-checks every currently-`sent` invoice instead, which is correct
and cheap at Ridge's actual volume even if not maximally precise. Sets
`plays.status = 'settled'` the moment `paid_at` gets set, guarded to only
fire from `'played'` (a no-op, not an error, on a redelivered
notification), per the "Resolved" note above.

The OAuth connect flow: `/api/quickbooks/connect` (redirects to Intuit's
consent screen with a CSRF `state` cookie) and `/api/quickbooks/callback`
(validates state, exchanges the code, replaces whatever's in
`quickbooks_connection` with the new token pair -- a fresh authorization
always means "use this account from now on," so this replaces rather than
merges). No middleware exemption needed (unlike the SignWell/cron
routes) -- both routes are only ever reached by a logged-in Base Camp
user clicking through from Settings, and the session cookie survives the
round trip through Intuit's redirect, so `src/lib/supabase/middleware.ts`
never sees `!user` here the way it does for the truly sessionless
webhook/cron callers.

A new Settings > QuickBooks page
(`src/app/(app)/settings/quickbooks/page.tsx`, linked from `Nav.tsx`'s
`adminLinks` alongside Candidates/Revenue) shows connection status and a
Connect/Reconnect button. `quickbooks_connection` deliberately carries
**zero RLS policies** (enabled, no policy -- denies every role except the
service role) since its rows are live OAuth credentials, equivalent to an
API key. The one narrow exception: `src/app/actions/quickbooks.ts`
(`getQuickBooksConnectionStatus`) reads it via the service-role client but
selects only `realm_id`/`connected_at`/`access_token_expires_at` -- never
the token columns -- so the Settings page can show "connected or not"
with no path for a token to leak into the response even by accident.

**Resolves section 9's first open item:** Customer creation is automatic
(first invoice triggers `findOrCreateCustomer`), cached permanently via
the new `artists.qbo_customer_id` column so no artist risks a duplicate
QBO Customer across invoices. The Item (`"Booking Commission"` by
default, `QUICKBOOKS_COMMISSION_ITEM_NAME` to override) is deliberately
**not** auto-created the same way -- that's a chart-of-accounts decision
Greg makes once in QBO itself; `createInvoice` throws a clear error if the
named Item doesn't exist yet rather than guessing one into being.

The `add_quickbooks_invoicing_foundation` migration (all three schema
pieces above) hit the same auto-mode production-deploy block every prior
plain `ALTER TABLE`/`CREATE TABLE` in this project has hit -- logged in
`docs/db-schema-tracking-gaps.md` with the full replay SQL, same as the
settlement-table gaps above. It does **not** need to wait for anything
QBO-side; it's pure Base Camp schema and Greg can apply it whenever.

**Build status (2026-11-10): the invoice-creation trigger is built.**
Greg connected the real sandbox company on 2026-11-09 (Settings >
QuickBooks shows it live, `quickbooks_connection.realm_id` populated), so
this is no longer blind. New cron, `/api/cron/create-commission-invoices`
(`vercel.json`, `30 9 * * *` -- right after `send-settlement-reminders`),
two phases:

- **Phase 1** finds every `played` play with `settlement_submitted_at` set
  and no `commission_invoices` row yet (`kind='booking'`), skips anything
  Ridge doesn't book (`ridge_books`) or whose booking commission rate is
  still unknown (never invoices a guessed amount -- already flagged
  passively by the "rate not set" indicators on Revenue/Agent
  Commissions), and otherwise computes the real commission via
  `computePlayRevenue` (see the Walkout fix below) and inserts a `draft`
  `commission_invoices` row with the amount captured once, not re-read
  live later.
- **Phase 2** pushes every `draft` row (new ones from phase 1, and any
  from a prior run that didn't finish) through the provider: `createInvoice`
  if it doesn't have a `provider_invoice_id` yet, then `sendInvoice` either
  way, only setting `status='sent'`/`sent_at` once the send succeeds. A
  failure at either step leaves the row as `draft` (with
  `provider_invoice_id` saved if `createInvoice` got that far) so the next
  run retries only the unfinished piece, never risking a duplicate QBO
  invoice. The billing contact is always the artist's own `role='artist'`
  contact (never the manager, per section 2's "Ridge invoices the artist"
  -- the manager rides along as a CC, see below, but is never the billed
  party) -- if none has an email on file, or the provider call throws, the
  play is logged and Greg gets a direct alert via the existing
  `logEmailFailure`/`alertGregOfEmailFailure` path (new email kind,
  `commission_invoice_blocked`) rather than silently stalling forever.
  Confirmed (2026-11-12, re: Greg's "if this email send fails, please
  notify my email like we do on the others"): this already covers a
  `sendInvoice` failure too, not just a blocked/missing-contact case --
  the try/catch in Phase 2 wraps both `createInvoice` and `sendInvoice`,
  and either one throwing lands in the same `commission_invoice_blocked`
  alert to `FALLBACK_NOTIFY_EMAIL`. Nothing needed building here.
  Known gap, not solved this pass: that alert has no de-dup/escalation
  cadence of its own (unlike `send-settlement-reminders`), so an
  unresolved block re-alerts every run until Greg fixes the underlying gap
  (a missing contact, say) -- acceptable at today's volume, worth
  revisiting if it gets noisy.

**New provider method, `sendInvoice` (`src/lib/invoicing/types.ts`/
`quickbooks.ts`).** `createInvoice` alone only creates the object at QBO;
getting it in front of the customer needs Intuit's own
`POST .../invoice/{id}/send?sendTo=<email>`, which is what actually emails
QBO's own invoice template with a pay-online link -- this is the literal
mechanics of "QBO owns sending" (section 2), not fully built until now.
Kept as a separate interface method rather than folded into `createInvoice`
so a send failure after a successful create is a retryable gap (phase 2
above), not a half-finished invoice. NEEDS LIVE VERIFICATION, same caveat
as the rest of `quickbooks.ts` -- not yet smoke-tested against the real
sandbox connection.

**Management notice on invoice send (2026-11-12, per Greg: "let's add
artist and management to the invoice send so multiple people are on
copy") -- superseded same day once the first live test actually ran.**
First attempt: `CreateInvoiceInput` gained `ccEmail`, and `createInvoice`
set `BillEmailCc` on the Invoice object at create time (documented fields,
per Intuit's legacy SDK reference, with CC/BCC gated behind
`ToBeEmailed`). Flagged **NEEDS LIVE VERIFICATION** since documentation on
whether `BillEmailCc` actually survives via the real Accounting API v3 was
inconclusive either way.

**It didn't survive at all.** The very first live `createInvoice` call
against the real sandbox connection (Cody Webb's 11/1 invoice, triggered
from the new review-gate UI) came back a 400 `ValidationFault`:
`"Request has invalid or unsupported property"`, naming the failing
property as an unresolved placeholder in QBO's own error body --
consistent with a field QBO's schema doesn't recognize at all, not a
value-validation complaint on a field it does. Nothing was sent (create
failed before `sendInvoice` ever ran), so this cost nothing except
answering the open question for good: `BillEmailCc` is not usable via
this endpoint. **Resolved by dropping it entirely** rather than continuing
to guess at the correct shape -- `createInvoice` now only sets `BillEmail`
and `ToBeEmailed` (both far more standard/commonly used than
`BillEmailCc` ever was, and neither was named in the error, though they
remain unverified themselves until a create call actually succeeds end to
end). `ccEmail` was removed from `CreateInvoiceInput` -- it never did
anything else.

**In its place: a separate, Base-Camp-sent notice**, exactly the fallback
this section had already floated as a contingency.
`sendCommissionInvoiceManagerNotice` (`lib/approvalEmail.ts`, same
Resend-based pattern/trust level as every other automated email in this
file) fires from `pushCommissionInvoiceRow` once `sendInvoice` has
already succeeded -- best-effort, never unwinding or retrying the real
invoice send if the notice itself fails (logged via the existing
`logEmailFailure`, new kind `commission_invoice_manager_notice`).
Deliberately not the invoice or a payable document -- that stays
exclusively QBO's own email to the artist, same "the artist is who's
billed" split as section 2 -- just a plain "an invoice for $X was just
sent to so-and-so" FYI to every `role='manager'` contact on file. The
review card's "CC N managers" became "N manager(s) notified" to match
(`PendingCommissionInvoiceRow.managerNoticeCount`, renamed from
`ccEmailCount`) -- this is Base Camp's own notification now, not a
literal email CC, and the UI should say so. Greg separately asked
whether his own email should be CC'd on every send too -- recommended
against it as a standing feature (redundant with the review gate's own
confirmation and the existing failure alerts; would just get noisier as
volume grows) in favor of a one-time manual test: temporarily add
himself as a `role='manager'` contact on Cody's profile, confirm he
receives this same notice, then remove it.

**Bug found and fixed along the way: `computePlayRevenue` never actually
implemented the Walkout formula change from section 2 (2026-10-26).** The
booking/management bases were still guarantee-only/guarantee+merch,
silently ignoring `walkout_amount` three weeks after that decision was
recorded -- caught by checking two real plays (Cody Webb, show dates
2026-11-01 and 2026-11-07) that already have real `walkout_amount` values
from testing the `/settle/[token]` form: the old formula would have
invoiced half the correct amount on both ($250/$650 instead of the correct
$500/$1,300 at a 10% booking rate). Fixed in `src/lib/revenue.ts`
(`CommissionPlayInput` gained `walkoutAmount`, both bases now add it in)
and the one caller, `src/app/(app)/revenue/page.tsx` (now selects/passes
`walkout_amount`). This also quietly corrects the live Revenue and Agent
Commissions pages, not just the new invoice trigger -- they were
understating commission on any play with walkout dollars the whole time.

**Correction (2026-11-11): the above "fix" was itself wrong -- Walkout
replaces the guarantee as the commission basis, it doesn't add to it.**
Caught by Greg looking at the two real Cody Webb commission_invoices rows
the fix above produced ($1,300 for the 11/1 show, $500 for 11/7) and
recognizing them as double what they should be. Walkout is the real,
reconciled/settled amount between artist and venue at the end of the
night -- once it's known, *it's* the commissionable number, full stop; the
guarantee is only a pre-show estimate, used as the basis solely in the
absence of a Walkout figure. The 2026-10-26 "add Walkout to the guarantee"
formula was never right; it happened to go undetected until now because
Cody Webb's two test plays had `walkout_amount` set equal to
`guarantee_amount`, which made `guarantee + walkout` compute to exactly
double the guarantee -- read as "20% instead of 10%" when it was actually
a basis bug, not a rate bug. Fixed in `src/lib/revenue.ts`:
`computePlayRevenue` now uses `settledBasis = walkoutAmount ?? guaranteeAmount`
(never summed) for both legs, merch still added on top for management
only. `tsc`/`eslint` clean. Confirmed while fixing this: each leg is
already computed at most once per play and only when `ridge_books`/
`ridge_manages` actually applies -- no double-counting there, nothing to
change.

Data fix, same sitting: Cody Webb's two draft `commission_invoices` rows
corrected to the right amounts under the new formula --
`392f0506-a672-45a4-8317-3d16b8ff6b3f` (11/1 show) from $1,300 to **$650**
(10% of the $6,500 walkout alone), `c4636930-5067-448f-a36b-f9341f77e62a`
(11/7 show) from $500 to **$250** (10% of the $2,500 walkout alone). Both
rows' `provider_invoice_id` was also cleared (they'd already been created
in the QBO sandbox at the old, wrong amount, but never sent --
`sent_at`/`status` were still `draft`) so the next invoicing-cron run
creates a fresh, correctly-priced sandbox invoice rather than sending the
stale one. The two original wrong-amount sandbox invoices are orphaned in
QBO's sandbox company -- harmless (sandbox only, never emailed to Cody),
but not auto-deleted, since no `voidInvoice`/update method exists in
`src/lib/invoicing/` yet; Greg can delete them by hand in the sandbox if
he wants the company file tidy.

**Resolved same sitting (2026-11-11): `walkout_amount` now means the full
settled total, excluding merch -- not the delta beyond guarantee.** The
open question above (whether the delta-collecting form from section 4
matched the new basis-replacement formula) went to Greg directly: his
call is total settled payout, excluding merch. Section 4's original
framing ("asks only for the delta... writes directly and unambiguously
into walkout_amount") is superseded by this. Updated to match, same
sitting:
- `/settle/[token]`'s form label (`src/app/settle/[token]/page.tsx`) now
  reads "Walkout -- what was the total amount you walked out with
  tonight, excluding merch?" -- replacing the old "Walkout (overage above
  guarantee, if any)."
- The Play detail page's Settlement card (`src/app/(app)/plays/[id]/page.tsx`)
  label changed from "Walkout (back end)" to "Walkout (total, excl.
  merch)," and its explanatory note now says Walkout replaces the
  Guarantee as the commission basis once set, rather than describing it
  as an overage "commissioned on both legs together."
- `src/lib/settlementExpenses.ts`'s header comment updated to match (no
  functional change -- Expenses stays purely informational, never feeding
  the commission formula either way).

Nothing in the data model changed -- `walkout_amount` is still one nullable
numeric column; only what Base Camp asks for and tells Greg it means
changed. Historical/already-submitted `walkout_amount` values from before
today keep whatever an artist actually entered under the old delta
framing; no retrofit sweep, same active-pipeline-only convention as
section 2. `tsc`/`eslint` clean on all three files.

Also still needed from Greg, external to this codebase (unchanged from the
build note above): register a developer app at developer.intuit.com (done
-- see the sandbox connection above) and get a sandbox company (done); set
`QUICKBOOKS_CLIENT_ID`/`QUICKBOOKS_CLIENT_SECRET`/
`QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN` as Vercel env vars; create the
"Booking Commission" Item in QBO itself -- **not yet confirmed one exists
in the sandbox company**, and `createInvoice` throws a clear error if it
doesn't. `tsc`/`eslint`/`next build` all clean. Not yet run against the
real sandbox connection -- the first real invocation will actually call
QBO's sandbox API and attempt to email Cody Webb's real address
(`cwebb155@gmail.com`) via Resend, so that first run should be a deliberate,
watched one, not an unattended cron firing blind.

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

- ~~Does creating a QBO Customer for an artist happen automatically (first
  invoice triggers it) or does Greg set artists up in QBO by hand
  first?~~ **Resolved (2026-11-02): automatic, cached via
  `artists.qbo_customer_id` -- see section 6's Build status note.**
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
  **Sharpened into a concrete decision (2026-11-12), per Greg: "should we
  treat the invoice send in the same manner we treat the contract send
  with a simple review step by a human in the loop or do we trust the
  process we've built here?"** For contrast, contract sending
  (`sendContractToBuyer`/`ContractReviewActions.tsx`) is never automatic:
  a human opens one specific play, reads the generated document, and
  clicks a two-step "Send to buyer" confirmation -- a real, hard-to-
  reverse action gated behind an explicit per-document human decision
  every time. Today's commission-invoice cron is the opposite: fully
  unattended, batch, no human ever looks at an amount or recipient before
  QBO emails it. Recommendation given to Greg: add a lightweight review
  gate before Phase 2's provider calls -- rather than mirroring
  `ContractReviewActions`'s full per-document click-through (invoices are
  batched/scheduled, not one-at-a-time the way a contract is), the
  simplest version is an `approved_at` gate on `commission_invoices`: Phase
  1 keeps drafting rows exactly as now, but Phase 2 only pushes a row
  through `createInvoice`/`sendInvoice` once `approved_at` is set, via a
  short review list (artist, play, amount, drafted date) with an
  "Approve & send" action -- reusing Phase 2's existing per-row logic, not
  duplicating it. Reasoning: the exact bug this plan already caught once
  (the 2026-11-11 Walkout-basis error, section 6) was a silent formula
  mistake that would have kept invoicing wrong amounts indefinitely with
  zero human in the loop to catch it -- the same failure mode a review
  gate exists to prevent. **Resolved (2026-11-12): built, exactly as
  recommended above.** `commission_invoices.approved_at` (new column) is
  the gate -- Phase 1 of the daily cron is unchanged, but Phase 2 now only
  pushes a row through the provider once `approved_at` is set
  (`.not("approved_at", "is", null)` added to its query), so an unreviewed
  draft just sits there instead of auto-sending on the next run. The
  actual create/send logic was pulled out of the cron route into
  `src/lib/invoicing/pushCommissionInvoice.ts` (`pushCommissionInvoiceRow`)
  so it has exactly one home, called both by the cron (retrying anything
  approved-but-not-yet-sent) and by the new review UI. That UI --
  `CommissionInvoiceApprovals.tsx`, backed by
  `src/app/actions/commissionInvoices.ts` -- sits above The Ridge Revenue
  section on `/revenue` (a to-do, not a report) and lists every drafted,
  unapproved row: artist, show date/venue, the booking agent, a "show
  report received [date]" freshness note, and who's on the email (to/CC
  count) -- deliberately *not* the commission math or a "booking
  commission" label, both redundant once you already know the rate is
  fixed and management-commission invoicing isn't built yet (every row
  here is booking, full stop). "Approve & send" (single row, two-step
  confirm, same pattern as `ContractReviewActions`) sets `approved_at`
  and immediately calls the shared push function -- no waiting for
  tomorrow's 9:30am run. "Approve & send all" does the same for the whole
  list, one confirmation instead of one per row. `Nav.tsx` gained a
  second badge type, `alertCounts` (solid orange, vs. the existing muted
  `counts`), shown on the Revenue link whenever this queue isn't empty --
  computed admin-only in `(app)/layout.tsx`, same gate as the Revenue
  link itself. Direct consequence Greg flagged in the moment: Cody Webb's
  two already-drafted rows ($650/$250, corrected earlier this session)
  show up in this exact queue the moment it ships -- approving them there
  is now the intended way to send them, not the `curl`/`CRON_SECRET`
  workaround used before this existed.

  **Bug in the gate itself, found the same day it shipped: a failed
  approval used to vanish instead of surfacing.** `approveAndSendCommissionInvoice`
  sets `approved_at` *before* attempting the push (deliberately -- so a
  crash mid-send still shows it was a reviewed decision, not an accident),
  but the review query originally only listed rows where `approved_at`
  was still null. Cody Webb's 11/1 invoice hit exactly this: the
  `BillEmailCc` failure (just above) left it `status='draft'`,
  `approved_at` set, `provider_invoice_id` still null -- approved,
  attempted, failed, and invisible to the card Greg was looking at (only
  the 11/7 row showed). **Fixed**: the query now lists every `'draft'`
  row regardless of `approved_at`, a new `commission_invoices.last_error`
  column stores the actual failure reason (cleared on a successful
  send), and `PendingCommissionInvoiceRow` gained `needsRetry`/`lastError`
  so the card shows a "Didn't send last time" tag, the real error inline,
  and a "Retry send" button instead of silently dropping the row.
  `approveAndSendCommissionInvoice` itself became idempotent on
  `approved_at` (sets it only if unset, then always runs the push) so the
  same action and button serve both a fresh approval and a retry. The
  nav badge count (`(app)/layout.tsx`) was broadened the same way, so it
  reflects the true "needs attention" total, not just fresh drafts.

  **Correction (2026-11-12, second live attempt): the actual cause of the
  400 was never `BillEmailCc` -- it was `ToBeEmailed`.** Greg clicked
  "Retry send" on Cody's 11/1 invoice right after the fix above shipped,
  with `BillEmailCc` already removed, and got the exact same 400
  `ValidationFault` back. The earlier diagnosis had assumed the newest
  field was the guilty one, but the error text never actually names a
  field at all -- `"Property Name:failed to parse json object; a
  property specified is unsupported or invalid"` is Intuit's fixed
  boilerplate for "the request body doesn't deserialize into an Invoice,"
  not a per-field message, as confirmed by a community thread hitting the
  same code (2010) from a genuine JSON syntax error, nothing to do with
  any specific property. Checked the real Invoice entity reference this
  time instead of going by recency: `BillEmail`/`BillEmailCc`/
  `BillEmailBcc`/`EmailStatus` are all real, documented fields on
  `SalesTransaction` (which Invoice inherits from) -- but `ToBeEmailed`,
  which this file had been setting alongside `BillEmail` since the very
  first version, is not a field on the Invoice entity under any name.
  That's the unrecognized property that was tripping this error the
  whole time; `BillEmailCc` was very likely innocent and got removed on
  a bad guess. **Fixed**: `ToBeEmailed: true` dropped from `createInvoice`'s
  payload in `quickbooks.ts`; `BillEmail` kept (it's real, and
  `sendInvoice`'s own dedicated endpoint call is what actually triggers
  the send regardless). Left for Greg to decide, not reopened here: now
  that `BillEmailCc` looks like it may actually have been usable after
  all, it's worth considering bringing it back instead of (or alongside)
  `sendCommissionInvoiceManagerNotice` -- but the notice path already
  works end to end, so this fix stays scoped to clearing the one field
  that's confirmed bogus. `tsc`/`eslint` clean.
- Where "would you play this venue again?" actually lives (2026-10-31).
  It's captured per-play on the settlement form (section 4), but is a
  per-play answer the right home for it, or should a "yes"/"no" also
  update something persistent on the venue/company record -- which is
  presumably where an actual future rebooking decision gets made, not by
  paging back through past plays? Not designed.

## 10. Going live: QuickBooks production keys (2026-11-08/09)

Intuit's Development/sandbox keys cannot connect to a real, live QBO
company -- confirmed live via Intuit's own "no sandbox companies found for
the user" OAuth error. Getting Production Client ID/Secret requires
clearing two checklist items on the Production tab of the Intuit developer
app ("Base Camp Invoicing"):

- **App details (done, 100%):** host domain, launch/disconnect/connect
  URLs all pointed at `https://base-camp-lovat.vercel.app/settings/quickbooks`;
  category "Invoicing & payments"; hosting country United States (no fixed
  outbound IP -- left blank per Intuit's own guidance for serverless
  platforms); EULA/privacy policy URLs pointed at two new pages built for
  this, `/legal/eula` and `/legal/privacy` (`src/app/legal/`, exempted from
  the login redirect in `src/lib/supabase/middleware.ts`'s `isPublicRoute`
  so Intuit's reviewers can open them with no Base Camp account). Also
  added a real Disconnect flow (`disconnectConnection()` in
  `src/lib/invoicing/quickbooks.ts`, wired to a button on Settings >
  QuickBooks) since there wasn't one before and Intuit's checklist asks for
  a working disconnect URL, not just one that resolves.
- **Compliance (in progress):** an external "App assessment questionnaire"
  (six tabs: General, App Information, Authorization & Authentication, API
  Usage, Error Handling, Security). Two answers researched rather than
  guessed, since a wrong one either blocks approval or quietly misstates
  something:
  - **Sandbox connect/disconnect/reconnect testing is a documented hard
    gate** -- Intuit's own stated policy (per third-party integration-
    platform docs that quote it directly) is that it rejects the app if
    this is answered "No." Not yet done (no sandbox company existed on
    Greg's Intuit account until now) -- **must** be completed before
    submitting, not optional.
  - **Capturing the `intuit_tid` response header is best-practice, not a
    documented hard gate** -- added anyway since it's cheap: every thrown
    error in `src/lib/invoicing/quickbooks.ts` now includes it via a
    shared `describeFailedResponse()` helper, when Intuit's response
    included one.
  - Everything else on the questionnaire splits into (a) purely technical
    answers confirmable from this codebase, (b) business/legal attestations
    about Ridge Music Group that are Greg's to confirm (regulatory
    complaints, legal counsel, sanctions exposure, security team, prior
    breaches), and (c) a couple of honest "No"s that aren't believed to be
    blocking on their own for a small single-company integration (no OAuth
    discovery-document use; no auth-retry-on-failure logic, paired with a
    "Yes" on asking users to reconnect instead).

**Not yet done:** the sandbox OAuth test itself; submitting the
questionnaire; swapping `QUICKBOOKS_CLIENT_ID`/`QUICKBOOKS_CLIENT_SECRET`
in Vercel from Development to Production values once approved; a fresh
deploy; retrying the real Connect flow against Ridge Music Group's actual
QBO company.

## 11. Internal agent commission tracking (2026-11-10)

A different concern from everything above, worth being precise about: sections
1-10 are all **money in** -- what the artist owes Ridge, and getting paid for
it. This section is the opposite direction -- **money Ridge owes its own
booking staff** -- but it's documented in this same file since it's built
directly on top of the same booking-commission numbers (`computePlayRevenue`'s
`bookingCommission`, never the management leg), not because the "money in
only" boundary from section 2 has changed. That boundary is actually
reaffirmed here, just applied to a new direction: Base Camp tracks who
booked what and computes what's owed to them, the same way it tracks
Earned/Collected for Ridge's own revenue -- it does not run payroll, cut a
check, or send money anywhere. Actually paying an agent stays outside Base
Camp entirely, same as expenses/payroll/P&L/taxes already do per section 2.

**Trigger: Greg is onboarding Ridge's first non-owner booking agent this
week**, and needs a clear, consistent way to know which agent booked which
play so commission gets paid correctly -- including the case where an
agent books outside their usual artist roster (Greg: "I will attempt to
separate artists by agent... I expect there will be times when agents are
booking for all of the artists"), so attribution has to be a real per-play
fact, never just inferred from a static artist-to-agent mapping.

**Commission structure (per Greg): a split of Ridge's own booking
commission**, not a separate rate off the guarantee and not a flat fee.
Standard "override" structure at talent agencies -- e.g. a 50/50 house
split means the agent earns 50% of whatever `bookingCommission` Ridge
itself already earns on a play, computed by the exact same function that
drives the rest of this page's numbers. Deliberately not derived from a
new, separate rate -- one commission number, two parties splitting it.

**Data model, two new columns (migration `add_booking_agent_commission_tracking`,
applied cleanly, no auto-mode block this time):**

| Column | Purpose |
|---|---|
| `plays.booking_agent_user_id` | Who at Ridge gets commission credit for this booking. `uuid references auth.users(id) on delete set null`, mirrors `outreach_log.user_id` exactly -- nullable, editable per play, never locked in at creation. |
| `user_profiles.booking_commission_split_pct` | This person's split, whole-number percentage (50 means 50%), same convention as `booking_agent_commission_pct` elsewhere. Null means "no rate set yet" and is never treated as 0 -- same missing-rate discipline `computePlayRevenue` already uses for the artist-facing rates. |

**Not the same thing as the artist's own "Booking Agent" team-role contact.**
`contact_artists.role = 'agent'` (shown on the Artist page's Team card,
label "Booking Agent") is the artist's own outside representation -- a
`contacts` row, not necessarily a Base Camp account, and in practice today
it's sometimes Greg's own contact entry standing in for "who at Ridge
handles this artist." `plays.booking_agent_user_id` is a different, new
concept: which real Base Camp account gets paid for *this specific
booking*. The two are related (see the pre-fill below) but not merged --
one is artist-level external-facing contact info, the other is per-play
internal payroll attribution.

**Pre-fill from the existing artist contact, by name match -- not email,
and not a new `artists.default_booking_agent_user_id` column.** Per Greg:
"that work is really already built with the agent field on the artist
profile," so a new play for an artist pre-fills `booking_agent_user_id`
from that artist's `contact_artists` role=`'agent'` contact, matched to a
Base Camp account by `full_name` against `user_profiles.display_name`
(case-insensitive). Deliberately name-matched rather than email-matched:
resolving a contact to a real auth account by email would need the Admin
API (`auth.admin.*`, service-role-only), and this project keeps
service-role use to a short, explicitly named list (see
`serviceRole.ts`'s header comment) -- not worth expanding for a
convenience pre-fill. A name-match miss just leaves the field blank, same
as any other unset field; it's always still fully editable per play
afterward, so a miss here costs a click, never a wrong commission.

**Bug found and fixed along the way: `listTeamMembers()` was being used
from a non-admin-safe page.** `app/actions/userProfiles.ts`'s
`listTeamMembers()` is `requireAdmin()`-gated (it reads the Admin API for
email/invite-status/is_admin, data this app otherwise keeps strictly
behind the Admin nav section). The Event detail page was already calling
it directly to resolve outreach "pitched by" names, despite that page
itself being open to every Base Camp user, not just admins -- harmless
today only because the two real accounts (Greg, Justin) are both admins,
but it would have silently redirected the incoming non-admin agent to the
Dashboard the moment they opened any Event page. Fixed by adding a second,
non-admin-safe function, `listAttributableTeamMembers()` -- normal session
client (no service role), returns only `id`/`display_name` (no email, no
admin flag, no status), safe for any authenticated page to use for "pick a
teammate to credit for something." The Event page and the new
`booking_agent_user_id` picker on the Play detail page both use this one;
`listTeamMembers()` stays reserved for the actual Settings > Team admin
page. Going forward: any new "attribute this to a teammate" UI should use
`listAttributableTeamMembers()`, never `listTeamMembers()`, unless it's
genuinely admin-only.

**UI, three places:**
- **Play detail page, Deal card:** a new "Booking agent (internal)"
  select (`InlineSelectField`, static options from
  `listAttributableTeamMembers()`, "Unassigned" as the empty option) --
  labeled and tooltipped to distinguish it from the artist's own outside
  representation.
- **Settings > Team:** a new inline-editable "Booking commission split"
  percentage per account (`InlineCommissionSplitField`, mirrors
  `InlineDisplayNameField`'s interaction exactly), admin-only to set
  (`updateBookingCommissionSplitPct` calls `requireAdmin()` itself, unlike
  the self-editable display name).
- **Revenue page, new "Agent Commissions" section** (`AgentCommissions.tsx`,
  plain server-rendered table, admin-only like the rest of the page): per
  agent, plays booked, Ridge's booking commission total on those plays
  (booking leg only), their split %, and their computed share -- grouped
  from the exact same `liveRows`/`computePlayRevenue` results the table
  above it already computes, not a second pass of the commission math.
  Same live scope as the rest of the page (non-legacy,
  non-declined/cancelled) -- an agent's pay tracks what's real right now,
  not the historical backlog. A "rate not set" flag replaces a silent 0%
  when an agent's split hasn't been configured yet, and an "Unassigned"
  row (sorted last) surfaces plays with no agent credited yet, rather than
  letting them quietly vanish from the rollup.

**Build status (2026-11-10).** Built end to end: the migration (both
columns, applied directly, not blocked this time -- see above), the
`listTeamMembers()`/Events-page fix, the Play detail field with its
name-matched pre-fill, the Team page's split-% field, and the Revenue
page's Agent Commissions section. `tsc`/`eslint`/`next build` all clean.

**Not a sync bug (2026-11-12) -- a one-time attribution gap, now backfilled.**
Greg saw Agent Commissions showing "rate not set" despite having set
70% splits for all three team members on Settings → Team, and asked how
to "sync" the two. Checked the real data rather than assumed: the splits
were never out of sync -- all 20 live plays simply had
`booking_agent_user_id` still `null`, because the pre-fill above only
ever applied to *new* plays created after that feature shipped; these 20
predate it. Every artist with a live play (Brittany Elise, Cody Webb,
Lindstrom) has "Greg Burroughs" as their `contact_artists` role=`'agent'`
contact, which name-matches his own `user_profiles.display_name` exactly
-- so, per Greg, backfilled `booking_agent_user_id` on all 20 directly
(same name-match logic the pre-fill already uses, just run once against
existing rows instead of only at play-creation time). Agent Commissions
now shows a real Greg Burroughs row at his 70% split instead of an
all-Unassigned table. No code changed for this -- it was purely a data
gap, not a logic bug -- so there's no future-proofing here against the
same gap recurring for a *new* agent's pre-existing plays if one ever
needs a retroactive assignment; that'd be the same one-off backfill
again, by hand.

**Explicitly deferred / open:**
- **Per-play override of an agent's split.** Mirrors how
  `booking_agent_commission_pct` already supports a play-level override of
  the artist's default rate -- the same shape would let Greg negotiate a
  one-off split for a single booking without changing that agent's
  standing rate. Not built this pass; add if a real case comes up.
- **Year/date filtering on Agent Commissions.** The section reuses
  Revenue's live-rows scope as-is (no year pills, unlike the Plays list) --
  fine for a first pass with one new agent, but worth revisiting once
  there's enough history to want a year-over-year agent view.
- **No bridge to actually paying an agent.** Same boundary as section 2 --
  this section computes and displays what's owed, it doesn't generate a
  payroll run, a QBO vendor bill, or any payment. If Greg ever wants that
  bridged (e.g. a QBO bill per agent per period), that's new scope, not
  something this pass built toward.
- **Multiple agents splitting one play** (e.g. a co-booked show) isn't
  modeled -- `booking_agent_user_id` is a single value. Not raised as a
  real need yet; would need its own design (a join table, most likely) if
  it comes up.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc -- same rule as
`docs/outreach-engine-plan.md`.
