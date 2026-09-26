# Outreach Engine Plan

High-level plan for Base Camp's nationwide event-discovery and artist-outreach
system, worked out across a full planning conversation before any of it gets
built. Mirrors the published reference at
`https://claude.ai/artifact/Ftpm6JvXtBXnXNqgPpADRz`, but this file is the
durable source of truth for any session working in this repo going forward.

Starting state: South Carolina, 238 verified events. Status as of this
document: plan settled, pre-build.

## 1. Vision

Build the biggest, cleanest database possible of recurring music-friendly
events — festivals, fairs, city and municipal series, First Fridays, Music on
Main, Live After Five — starting in South Carolina and expanding outward
toward full national coverage. That database feeds a standing outreach
rhythm: every morning, a batch of Gmail drafts is waiting, pre-written in
Greg's voice, for him to edit and send by hand. Nothing goes out on its own,
ever. Built from day one to scale toward a small team of booking agents
working the same roster, even though it's one person today.

## 2. The three engines

Discovery runs on its own independent, credit-bounded clock. Catch-up and
the standing cadence are what actually put drafts in Greg's Gmail, and
together they run on a separate, steadier rhythm once a region's data
exists — discovery never waits on outreach, and outreach never waits on
discovery finishing the whole country.

**Engine 1 — Discovery.** Exhaustive, primary-source research, state by
state, with the same rigor as the SC tracker (verified leads, a
nothing-found log, a false-leads log). Runs on its own clock, independent of
outreach: as fast as reasonably possible without burning an unreasonable
amount of credit. Baseline target is a new state roughly every other day,
faster whenever that's affordable. Priority order: Southeast first, then
Midwest, then Northeast, then the rest of the country. Runs once per state
as the initial build-out.

**Pacing correction (2026-09-26).** The first real firing on Georgia
stopped after only two sub-regions (coastal GA + north GA mountains) in
about 12 minutes — nowhere near the "roughly every other day" baseline
above, and far too slow to get through the country. It stopped early by
its own judgment ("reasonable research time for today"), not because it
ran out of real sources to check. Rewrote the scheduled task's prompt to
require building an explicit region/metro checklist for the state up
front and working straight through the whole thing in one sitting —
finishing an average-sized state entirely in a single firing is now the
target, with a second firing only as a fallback for unusually large states
(TX/CA/FL-scale), not the default. Watching the next GA firing to confirm
this actually closes the gap; will tune further from that real result.

**Engine 2 — Catch-up.** Fires once, as a burst, the moment a state finishes
discovery — not an ongoing rotation. Works the new backlog by how far out
each event is:

| Days out | Action |
|---|---|
| < 60 | No lineup posted → pitch now, urgent tone |
| 61–179 | Same "pitch now" rule, relaxed tone — already inside the ideal contact window, waiting only shrinks the runway |
| 180+ | Leave alone — it's the standing cadence's job starting at exactly this boundary |

For a recurring series or festival, "days out" is measured from the first
occurrence of the upcoming season, not from each individual date.

**Engine 3 — Standing cadence.** The permanent heartbeat once a region is
caught up: the whole country divided into 10 regions, one region's slot
advancing roughly every other day (several smaller regions can share a
slot), covering the whole country on a ~2-week rotation. Each region's slot
pulls in whatever's 180+ days out as of that slot's own date — the same
boundary catch-up hands off at, so nothing is ever double-owned or silently
dropped between the two engines. A fresh draft regenerates each cycle as an
event re-enters the window — no per-event follow-up bookkeeping needed once
this is running.

**Refresh.** Resolved as two triggers per event, whichever fires first:

1. **Flat safety net** — every 6 months from `discovered_at` (or the last
   refresh). Guarantees no event goes unchecked for more than 6 months no
   matter how wrong our date estimate for it is. This was the original,
   simpler design (see below for why it isn't enough alone).
2. **Booking-lead-time trigger** — the moment an event's currently-believed
   next occurrence comes within 240 days (~8 months) out, refresh it right
   then, regardless of where its flat clock stands. 240 is deliberately
   ~60 days ahead of Engine 3's own 180-day standing-cadence cutoff (see
   "Engine 3" above and section 10) — by the time any engine would
   consider pitching an event, its date has already been freshly
   re-verified, not coasting on a months-old guess. This also directly
   serves Ridge's real booking lead time (acts are typically booked 3-6+
   months out): the earlier a date change is caught, the better the odds
   of still landing the booking.

Checked against `source_url` rather than a blind re-scrape either way:
what's new (including next year's dates for the same series), what's
stopped happening, is the contact still right, is the recurrence pattern
("every Thursday, March–October") still accurate.

Why two triggers instead of one: a purely anchored schedule (checking
based only on the event's own believed date) was considered and rejected
early on — it would make refresh's own timeliness depend on the accuracy
of the very estimate it exists to correct, and a wrong estimate could push
the check so late the real booking window is already gone (an event that
quietly moved from June to May, for instance, might not get caught until
after May). The flat-only clock avoids that failure but creates a
different one: discovery moves through states in tight batches, so most of
the country's `discovered_at` timestamps land close together — a flat-only
clock means whole states' worth of refresh work landing on the same day
every 6 months, forever, crowding out any daily research budget left for
finding new events at all. Combining both triggers fixes both problems:
the flat clock stays as the guaranteed backstop, but most events get
checked earlier, on their own natural rhythm — spread across the calendar
the same way real event dates already are, since the trigger is tied to
*when in the year* an event actually happens rather than when it happened
to be discovered.

**Annual new-discovery sweep.** Refresh (above) only re-checks events
already on file — it does not go looking for a brand-new festival that
popped up somewhere already covered, or a newly-announced series. That's a
separate, deliberately once-a-year pass: the last two weeks of December,
when (a) organizer sites are most likely to have just posted next year's
dates or a new listing once budgets are set for the new year, and (b)
booking activity/outreach responsiveness is typically quieter anyway,
making it a low-opportunity-cost window to spend research budget
re-scanning already-covered ground instead of pitching. Discovery of
states not yet covered at all continues on its own separate timeline in
parallel — this sweep is only for ground already covered.

**Shipped** (migration `refresh_mechanism`; scheduled task "Ridge CRM —
Refresh pass", daily `CRON_TZ=America/New_York 45 9 * * *`, 30 minutes
after discovery's own daily slot so the two never compete for the same
window). Both triggers live in one view, `events_due_for_refresh`, read by
the scheduled task each morning rather than recomputed ad hoc:
`events.last_refreshed_at` (null until first refresh; falls back to the
earliest `event_occurrences.discovered_at`, then `created_at`, for the flat
clock) plus each event's soonest future `event_occurrences.occurrence_date`
for the lead-time check. `events.refresh_flagged` is the "questionable"
counterpart to `dedup_uncertain` — set when a check comes back inconclusive
(dead source_url, ambiguous page, conflicting info) instead of guessing,
surfaced on the Events page's "Needs Refresh Check" pill; a successful
later refresh clears it.

Unlike discovery, Refresh is not a review gate — it only ever touches
events that are already live and already approved, so a confident
correction (date changed, contact changed, event confirmed defunct) is
applied directly; only the genuinely inconclusive case gets flagged
instead of decided. Capped at 25 events/day (tunable, same "watch real
consumption and adjust" approach as discovery's own pacing) — checked
against the real numbers before shipping: 120 of the 522 live events were
already within the 240-day lead-time window on day one (0 via the flat
clock yet, since nothing's 6 months old), so the initial backlog clears in
about a week at that rate rather than landing all at once, and this cap is
exactly what keeps it that way as it becomes steady-state, per the
pile-up/lead-time analysis above.

**Bug found and fixed after the first real firing (2026-09-26).** The
lead-time trigger originally checked only proximity to the next occurrence
date, with no gate on how recently the event had last been refreshed —
unlike the flat clock, which was already gated that way. Result: the
25 events refreshed on day one stayed right back in the due list the same
day, since their occurrence dates hadn't moved, so the daily cap would
have re-checked the same near-term events indefinitely instead of working
through the other 95. Fixed by adding a 30-day cooldown to the lead-time
trigger too — mirrors the flat clock's own gating, just much shorter, so
an event that's never been refreshed stays immediately eligible (the real
backlog the cap is meant to drain), while a freshly-refreshed one gets 30
days of rest before it can re-qualify, with room for another check as its
date keeps approaching. Verified live: still-due dropped from 120 to 95
immediately after the fix, matching the 25 processed that morning exactly.

The annual new-discovery sweep (last two weeks of December) is still just
resolved design — not built. Separate piece of work, deliberately scoped
out of this one.

**Occurrence rollover.** A lightweight daily check, independent of Refresh
and of any engine's region cycle: for every event with a `recurrence_rule`
whose most recent `event_occurrences` row (any confidence) is dated in the
past with nothing future already on file, insert a new `estimated`
occurrence projected one cycle forward from the pattern (annual: same
day-of-week/ordinal a year later; a seasonal series: the following season's
first date). This exists because Refresh and the region cadence both work
on a scale of months, and neither guarantees a future-dated anchor exists
at the moment Engine 2/3 actually need one — without it, an event whose
only known occurrence has already passed is invisible to both engines
until its refresh happens to land inside the right window, which can
arrive after that year's booking window has already closed. First surfaced
by a September 2026 import row where the only known date ("Sat Sept 12,
2026") had already passed by the time of import: with no rollover, that
event would have sat with only a past-dated occurrence until its next
refresh, missing the entire 2027 booking window. Rollover only ever
inserts `estimated` rows; it never touches `confirmed_date`/
`confirmed_pattern` rows, and Refresh's own job — checking the source_url,
correcting a wrong estimate — is unchanged and still runs on its own flat
6-month clock (see Refresh, above).

**Date/pattern extraction order.** The pilot import's parser originally
only ever looked for one explicit stated date and fell back straight to
"needs manual review" the instant it didn't find one — even on rows where
the source's own date text plainly stated a recurrence ("3rd Saturday
monthly", "Friday nights in season") or the event's own name carried an
obvious date cue ("4th of July Festival", "Sounds of Summer"). Both are
real signal that was being thrown away. `src/lib/dateSignalExtraction.ts`
fixes this with a fixed resolution order, checked in this sequence for
every event, before anything is allowed to fall back to `unknown`:

1. A single explicit date stated in the source text → `confirmed_date`.
   Matches both a written month name ("Sept 12, 2026") and a numeric
   `M/D/YYYY` date (e.g. "10/04/2025", including embedded in a timestamp
   string like `"Fri, 05/08/2026 - 18:00"`) — the numeric form was a real
   gap found while verifying this against the full 238-row sheet, so both
   forms are checked before falling through to anything below.
2. An ordinal-weekday-plus-frequency pattern stated in the source text
   itself (e.g. "3rd Saturday monthly") → `confirmed_pattern`. Season
   window uses an explicit range if the source gives one (full or
   abbreviated month names, e.g. "May-Aug"), otherwise defaults to
   year-round rather than guessing narrow.
3. A weekday-plus-frequency pattern stated in the source text (e.g.
   "Friday nights") — if the source also states the season window,
   `confirmed_pattern`; if the source only vaguely gestures at a season
   ("in season") and the actual window has to be filled in from the
   event's own name (e.g. "Sounds of Summer" → June–August) or defaulted
   to year-round, `estimated` — the weekday/frequency part is real, the
   season part is a guess, so the whole rule is marked at the lower
   confidence rather than overclaiming.
4. A single month named in the source text with no day and no weekday
   (e.g. "Mid-May", "Annual, December") → `estimated`, anchored to the
   1st of that month. Deliberately refuses to fire when the text names
   two or more months (even ones that don't cleanly parse as an explicit
   range in step 2) rather than guessing which one is "the" month — caught
   on a real row, "Year-round, Sept 2026-June 2027 posted", where grabbing
   just "June" out of that range would have been actively wrong.
5. Only once the source text has nothing at all: fall back to the event's
   own name — an ordinal-weekday phrase embedded in the name itself, a
   fixed-date holiday name (July 4th, Halloween, Memorial Day, etc. — via
   a new `annual-date` recurrence variant for the fixed-day cases), a bare
   month name, or a season word. Always `estimated`, and the notes record
   which cue it came from so a human or Refresh can sanity-check it later.
   Bare "Christmas" is deliberately handled as a month-only cue (December)
   rather than a fixed December 25th — a "Christmas Parade" is almost
   never literally held on Christmas Day, so claiming that exact day would
   be a confident-looking wrong guess rather than a useful placeholder;
   the same month-only treatment applies whether "Christmas" appears in
   the source text or only in the name.
6. Nothing usable anywhere in either text → genuinely `unknown`, and the
   event lands in Needs Date (below) rather than being silently guessed
   at wrong.

This is what let 3 of the pilot's 4 "needs manual review" events resolve
automatically on reprocessing (Hagood Mill's "3rd Saturday" series, the
Easley 4th of July Festival, and Sounds of Summer) — only Newberry Opera
House genuinely needed a human, since it's a year-round touring venue
with no single recurring pattern to extract, not a one-off name/date
extraction miss. Checked against the full 238-row SC sheet: of the 74
rows with no single clean stated date under the original parser, 31 now
resolve automatically (3 `confirmed_pattern`, 28 `estimated`) and 40
genuinely still need a human. This resolution order applies to every
future state's Engine 1 output too (see section 12), not just the SC
backlog — the goal is for `unknown`/Needs Date to be the genuine last
resort, not the default outcome whenever a source doesn't spell out one
clean date.

An event that resolves via any step above is no different from a
confirmed one as far as Engines 2 and 3 are concerned — it has a real
future-dated `event_occurrences` row, so catch-up and the standing
cadence compute "days out" from it and draft on the normal rhythm exactly
like a `confirmed_date` event would. `estimated` only changes when
Refresh double-checks it (every 6 months instead of never), not whether
it participates in outreach in the meantime.

**Needs Date (manual touch).** Occurrence rollover only helps once a
`recurrence_rule` exists to project from — an event with no inferable
pattern (a one-off with no stated recurrence, or existence confirmed with
no date given at all) has no future-dated `event_occurrences` row and
nothing to roll forward. Those sit outside catch-up and the standing
cadence indefinitely, since both engines only pull events with a
future-dated anchor. Rather than leave them silently dormant until a
refresh pass happens to notice, a Postgres view,
`events_needing_attention`, surfaces every non-archived event with no
`event_occurrences` row dated today or later. It backs two things: a
"Needs Date" filter pill on the Events page (same non-archived + no live
occurrence definition, expressed as a plain query against
`event_occurrences` rather than through the view directly, since
PostgREST's relationship embedding for the companies/contacts joins isn't
guaranteed to follow through a view the way it does the base table), and a
weekly digest email (`events-needing-attention` cron, Mondays) listing the
same set with links back into the app. This is the human path for records
Refresh and Rollover can't reach on their own — a regular, low-effort
check rather than something that has to be remembered.

**`companies.email`** — A general/organizational address (e.g. "City of
Greenville general contact"), distinct from a real contact's own email.
Exists because a source often names an organizer with a public contact
address but no actual person — that's organizer-level information, not a
contact, and previously had nowhere structured to live. Optional; a
company can be created and fully populated without one.

## 3. Data model

Two new tables; everything else stays as it is. New venues and organizers
become real `companies`/`contacts` rows, never a shadow copy.

**`event_occurrences`** — Locked in. One row per confirmed or estimated
happening: `occurrence_date`, `date_confidence`, `source_url`,
`verified_at`, `discovered_at`. For a recurring series, the rows are
anchors, not every date — the first occurrence of the season plus, once
known, the last — with a `recurrence_rule` on the parent event (frequency,
day of week, season start/end) describing the pattern in between. Outreach
timing for a series is always computed off its first-occurrence anchor.
`discovered_at` is also what Refresh counts its flat 6-month interval from.
`date_confidence` distinguishes what the source actually said from what we
inferred: `confirmed_date` is a specific date the source stated outright;
`confirmed_pattern` is a recurrence the source stated outright ("every
Thursday, March–October", "3rd Saturday monthly"); `estimated` is a date
or pattern *we* projected — from a single past date assumed annual, from
occurrence rollover (above), from a source-stated pattern whose season
window wasn't given and had to be filled in from the event's own name or
defaulted to year-round, or from a date/season cue read out of the event's
name alone with no source pattern at all (see "Date/pattern extraction
order," above) — and is expected to be corrected by the next Refresh pass
rather than trusted as fact; `unknown` means no usable date information
exists in either the source text or the event's own name.

**Disqualification.** Two distinct cases, deliberately not merged into one
mechanism. A real `companies`/`events` row that turns out to be wrong —
the organizer replies that the event is cancelled or postponed
indefinitely, or a human judges it's not a fit for the roster (e.g. a
large professionally-booked touring venue, already flagged as such in some
SC import notes) — is archived exactly like any other soft-delete
(`archived = true`, already respected by every picker/list/outreach
query), plus a new `disqualified_reason` text column on both tables so the
story isn't lost the way a bare `archived` flag would lose it. A lead that
never became a real row at all — Engine 1's own nothing-found and
false-lead logs, or any future lead ruled out before it was verified
enough to create real records — has nowhere to go in `companies`/`events`
by construction, so it lives in a new, deliberately lightweight
`dead_leads` table instead (organizer name, event name if any,
region/county/state, a `reason` of `nothing_found` / `false_lead` /
`not_a_fit` / `other`, notes, source_url). Its only job is to stop a
future discovery pass from re-spending research credits on the same dead
end — it's a checklist, not a CRM table, and nothing else reads from it.

**`outreach_log`** — Locked in. Scoped to `company_id` (falling back to
`contact_id` when no company match exists) rather than siloed by artist or
event, so history is visible across the whole roster — and across a future
second booking agent — from day one. Minimum-recontact rule lives here too:
no net-new automated pitch to the same company within 30 days of the last
one from this pipeline, regardless of which artist or event prompted it. A
floor, not a cap — it never limits how many drafts get created in a day,
only how soon one company can hear from the machine again, and it doesn't
apply to reply threads or anything sent outside the automated engines.
Status stops at `sent / replied / declined`. The moment something becomes a
real offer, it hands off to a `plays` row; `plays` stays the one source of
truth for booking status.

## 4. Identity & dedup

An event's identity is the composite of **organizer/venue identity +
normalized event name + recurrence pattern** — never the name alone.

This is what lets 37 events all named "First Friday" across 23 states
coexist as 37 distinct rows: organizer identity is anchored to a real
`companies` row with its own city, state, and required website, so
identical names at unrelated real-world organizers never collide. The event
page's `source_url` is evidence, refreshed in place each cycle — never the
join key, since organizer sites routinely rebuild event pages year to year
and would otherwise make a routine refresh look like a brand-new event.
Every new event goes through a dedup-before-insert review step first, the
same pattern as the `candidates` queue.

**Shipped, for Engine 1 (migration `discovery_visibility_and_dedup`).**
"Dedup-before-insert review step" turned out to mean an *automated*
fuzzy-match check, not a per-event human gate — Greg confirmed he reviews
a sample per state (see section 10/discovery_progress below), not hundreds
of individual events a day. Two new SQL functions, `find_company_match`
and `find_event_match`, run the same 3-tier auto-link scheme as `/book`
(section 8) before every discovery insert: near-exact name; a distinctive
multi-word name at moderate similarity; moderate similarity plus a geo/
venue match (event identity uses `venue_id` equality as the strongest geo
signal, per the composite identity above, falling back to city/state).
Anything above the 0.3 similarity floor that doesn't clear the auto-link
bar still gets created (discovery never blocks on a human) but is marked
`dedup_uncertain = true` and gets the same notes-breadcrumb the `/book` fix
uses, so it surfaces on the Events/Companies "Needs Dedup Check" filter
pill and in the state's review digest — Greg's "manually dedupe anything
questionable" middle ground between full per-event review and silent
auto-linking. These two functions deliberately do NOT exclude
`pending_state_review` rows from their candidate pool, since discovery has
to catch duplicates against its own not-yet-reviewed finds too (a state
can span several days of runs, and the same organizer often recurs).

Separately, discovery-sourced `events`/`companies` rows carry
`pending_state_review = true` until their state flips to `approved` in
`discovery_progress` — this is a *visibility* gate, not the dedup gate
above: it keeps unreviewed rows out of the live Events/Companies pages,
their nav-sidebar counts, relation-field pickers (`searchRecords`), the
`events_needing_attention` view, and the `rollover-occurrences` /
`scan-contacts` crons, the same way `archived` rows already are. It has no
effect on the fuzzy-match candidate pool (previous paragraph) or on
existing `/book`/quick-create matching, which now also excludes
`pending_state_review` rows from their own candidate pools (a public offer
submission or a manual quick-create shouldn't auto-link to a still-hidden
discovery row).

The same fuzzy-match-before-create step applies everywhere a company can
come into existence, not only during discovery: the quick-create popovers
on any relation field, the `candidates` review flow, and both sides of a
`/book` submission (venue and buyer company). One dedup mechanism, reused
everywhere, rather than exact-match-only in some places and nothing at all
in others.

## 5. Artist fit & availability

- **Genre matching** — Deprioritized. Stays a human/agent judgment call for
  this build; no structured genre field yet.
- **Availability** — Locked in. Checked against *both* `plays.show_date`
  (confirmed) and each artist's "Shows – The Ridge" Drive sheet (holds,
  early routing — deliberately kept out of Basecamp). Verified against the
  real sheets: `Confirmed` and `Block`/`Blocked` both mean unavailable;
  blank, `Open`, and `Hold` all mean safe to pitch. Read by column header,
  not position — not every sheet has a STATUS column yet, so a legacy row
  with none defaults to safe-to-pitch, though a stray "Unavailable" written
  into Notes on an old row still counts as blocking. Every artist's sheet
  gets a STATUS column as a standing convention going forward.
- **Multiple artists, one event** — Locked in. Pitch more than one when
  more than one genuinely fits.
- **Same artist, competing dates** — Locked in. Normal and expected — one
  email is not expected to yield one booking.
- **Daily draft volume** — Locked in. No cap. The calendar and database
  drive volume; quality over quantity always.

## 6. Outreach mechanics

- **Draft-only, always** — no auto-send, no exception, even for an
  imminent Tier 1 catch-up event.
- **No volume cap, ever** — the calendar and database drive how many
  drafts get created; nothing in this system throttles that. The only
  thing rate-limited (below) is how often one company gets contacted, never
  how many drafts land in a day.
- **Minimum recontact spacing** — no automated draft to the same company
  within 30 days of the last one this pipeline sent them, regardless of
  artist or event, so the relationship never feels like it's getting hit by
  a machine. A "don't recontact before" date set from a real reply ("we
  book in February") can push a specific event out further than the
  30-day floor — whichever date is later governs. Read by both catch-up
  and the standing cadence; replaces one-off scheduled tasks per organizer,
  which don't hold up past a handful of events.
- **Voice from Sent, not Drafts** — the edited, actually-sent emails are
  the model (inline headshot, full four-line signature block, tightened
  bio bullets), not whatever's still sitting unedited in the drafts queue.
- **Voice keeps learning** — a periodic, roughly monthly re-scan of Sent
  mail feeds the voice model, weighted toward the most recent examples over
  older ones, segmented by context (cold pitch vs. standing-cadence touch
  vs. personal callback, and eventually by artist and venue type) rather
  than one flat global voice.
- **Personal tone on any callback** — "I had in my notes that you start
  planning around this time" — never anything that reads like a system
  reciting a log.

## 7. CRM scope

Locked in: stay in Basecamp; don't integrate a pre-built sales-engagement
tool. The deal pipeline (`plays` — contracts, commissions, settlement) is
genuinely CRM-shaped and specific enough to music booking that it has to
live in-house. The outreach/prospecting layer is more of a commodity
problem, but the tools built for it assume auto-sequenced sending and
shared team/SDR structures — close to the opposite of "always human-gated,
one person editing and sending every email." `outreach_log` stays
lightweight and contact-first so it's additive, not a rebuild, if a second
booking agent joins later.

## 8. The /book gap

**Shipped.** The public offer-intake form (`/book`) is a separate,
unauthenticated path where any outside venue or promoter submits an offer
directly, through the `SECURITY DEFINER` function `submit_offer_inquiry`.

Venue matching already ran the same 3-tier fuzzy scheme used elsewhere
(near-exact name; distinctive multi-word name; moderate similarity + city/
state match) — that side needed no change. Buyer-company matching didn't:
it was a loose exact-name-or-single-tier-fuzzy match, and any miss silently
created a bare `name` + `type='promoter'` stub with no city/state/phone and
no record that a near-match existed.

Fix applied (migration `submit_offer_inquiry_buyer_company_fuzzy_match`):
buyer-company matching now runs the identical 3-tier scheme venues use,
with `p_buyer_city`/`p_buyer_state` (already collected on the `/book` form,
now actually passed through from `offerIntake.ts`) supplying the geo signal
for the third tier. A newly-created buyer company gets `city`/`state`
populated from the submission. When a weaker candidate existed (similarity
> 0.3, the same floor the `candidates` review flow uses) but didn't clear
the auto-link bar, the new company's `notes` records the closest candidate
and its similarity so the near-miss isn't silently lost — a human still
has to link it, but not by noticing a stray duplicate later. This reuses
the `notes`-breadcrumb pattern rather than adding new review-queue UI,
since the ask was to wire the matching step itself, not build a second
review surface next to the existing "needs match" flag on the Plays list
(which still covers unlinked venues) and the `candidates` review queue.

Known limitation, inherited from the venue-matching thresholds this reuses
rather than introduced by this fix: heavily abbreviated near-misses (e.g.
"Arts Ctr of Kershaw Cty" vs. "Arts Center of Kershaw County") can fall
short of the 0.6 similarity floor even with a city/state match, since
abbreviating words breaks up trigram similarity badly. Worth revisiting if
it shows up in practice, but out of scope for this pass.

## 9. Geographic sequencing

Two related but separate sequencing questions — one per engine.

**Engine 1 (discovery)** works state by state in priority order: Southeast
first, then Midwest, then Northeast, then the rest of the country.
Confirmed as good enough to start; refined against two real signals as it's
finalized — drive-time/tour-routing distance from Nashville, where most of
the roster lives and where touring economics actually run (the dominant
factor), with existing Basecamp relationship density (`companies`/`plays`
already on the books) as a tiebreaker. Deliberately prioritizes
artist-routing economics over Greg's own location in Boise. The concrete,
ordered state list is a next deliverable, not this document.

**Engines 2 & 3 (draft creation)** work off a separate 10-region map once a
state is caught up — states clustered into 10 groups sized for a roughly
two-week full-country rotation. Its own next deliverable, built once
discovery has enough of the country mapped for it to matter.

## 10. Pacing

Locked in: two separate paces for two separate jobs — easy to conflate,
worth keeping distinct.

- **Discovery (Engine 1)** — its own clock, balanced against plan credit
  rather than the calendar. Baseline target: a new state roughly every
  other day, faster whenever that's affordable — go as fast as reasonably
  possible without burning an unreasonable amount of credit. Not tied to
  the outreach cadence in any way.
- **Draft creation (Engines 2 & 3)** — catch-up fires once, as a burst,
  right after a state finishes discovery. The standing cadence then takes
  over permanently: 10 regions, each on a roughly every-other-day slot
  (smaller regions can share a slot), covering the whole country every two
  weeks, pulling in whatever's 180+ days out as of that slot's date.

No visibility into plan usage or billing from inside this build, so the
every-other-day discovery baseline is a starting point, not a guarantee —
watch real consumption for a couple of weeks and tune from that number
rather than a forecast.

## 11. Still open, to resolve during build

- Exact chunk size for a single discovery run within a state.
- The concrete, ordered state-priority list for Engine 1.
- The concrete 10-region map for Engines 2 & 3.

## 12. Discovery output contract (Engine 1)

Locked in, prompted by importing the South Carolina tracker (238 verified
rows, built by a parallel research pass before this contract existed).
That tracker used free-text research-notes columns — readable by a human,
but requiring a full reconciliation pass before it could become real
`companies`/`events`/`event_occurrences`/`contacts` rows: recurrence had to
be inferred from prose, contact name and channel had to be split out of one
field, tier/priority columns didn't map to anything in the schema. Doing
that translation once was acceptable; doing it for every future state would
turn a one-time cost into a recurring one. Going forward, Engine 1's own
output — whatever runs the state-by-state research pass — must be produced
already in Basecamp's shape, not as a free-text tracker translated after
the fact:

- **Organizer** — company name, a real attempted website (root domain is
  an acceptable placeholder, but every organizer should be deduped by name
  against already-created companies in the same run *and* against the
  existing `companies` table before a new row is created — never one row
  per source row), city, state, phone if found, and a general/org email if
  the source gives one with no named person attached (`companies.email`
  — see section 3; a named person's email belongs on a `contacts` row
  instead).
- **Event** — event name, and either a `confirmed_date` (a specific date
  the source stated) or a `recurrence_rule` (frequency, day of week,
  season start/end) plus a first occurrence anchor — never a bare
  free-text date string requiring later parsing. Before falling back to no
  date at all, run the full date/pattern extraction order (see section 2,
  "Date/pattern extraction order") against both the source's own date
  notes and the event's own name — `unknown` should be the genuine last
  resort, not the default whenever a source doesn't spell out one clean
  date.
- **Contact** — full name and title as separate fields, email and phone as
  separate fields, only populated when the source names an actual person.
  A generic line ("City of Greenville general contact") is organizer-level
  information, not a contact, and belongs on the company's own `phone`
  field instead.
- **Evidence** — `source_url` per event, so a later refresh has something
  to check against.
- **No priority/tier column** — outreach urgency is computed live by
  Engine 2 from the occurrence date, never carried as a static value from
  research time (a value frozen at discovery time goes stale the moment
  time passes). A field like "Booking Deadline" — a hard organizer-side
  cutoff distinct from our own 180-day rule — is useful context and should
  still be captured, but as free text on the event until it earns a
  structured field of its own.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc.
