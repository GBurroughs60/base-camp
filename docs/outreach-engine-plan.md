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

**Self-chaining (2026-09-28).** The "finish in one sitting" prompt
language above didn't hold — North Carolina's first firing hit the same
premature-stopping pattern GA hit on day one, confirmed by reading its
`research_log`: real work happened, but the firing stopped well short of
the checklist with no genuine blocker, the same "felt like enough for
today" judgment call the 2026-09-26 fix was meant to close off. Stronger
"don't stop" wording had already been tried once and failed, so this
fixes it structurally instead of with more prompt pressure: a firing that
isn't done for the day no longer just ends and waits for tomorrow's cron
slot. Its last action is now to call `fire_trigger` on its own trigger ID,
starting an immediate fresh continuation session rather than losing the
rest of the day. Step 3's "must finish in one sitting" urgency is relaxed
accordingly — a firing takes however much real, thorough research a
checklist chunk needs, since the very next chunk starts right away instead
of tomorrow.

Bounded with a same-day safety cap so a bad pattern can't loop
indefinitely on one state and burn a day's credit unsupervised: migration
`discovery_self_fire_cap` added `discovery_progress.self_fire_count`/
`self_fire_date` (the date the count applies to, so a stale count from a
prior day is treated as 0). Capped at 8 self-fires per state per day — at
the cap, the firing stops normally, logs that the cap was hit, and lets
the next day's regular cron slot pick up from there, same as before this
change existed. The daily cron itself is unchanged and stays as the
backstop that starts each state off and recovers if self-chaining is ever
capped or a firing genuinely gets stuck.

To keep the added chaining from turning into a wall of notifications, the
end-of-turn digest is now sized to what actually happened: an
intermediate self-chained continuation gets one line (state, regions
covered, how many self-fires so far today), while the full digest — the
15-20 event sample, the dedup-uncertain list, the approval contract text —
is reserved for a genuine `awaiting_review` completion or a real blocker,
same as it always was.

**Superseded (2026-10-17).** Everything below describing Engine 2 and
Engine 3 — the Gmail-draft-based catch-up/standing-cadence design, the
crawl-stage build, and the 10-region rotation — is kept as history, not
current design. Both are replaced by the in-app Action List described in
the new subsection right before section 3 ("Pivot: Catch-up & Standing
Cadence replaced by an in-app Action List"). Read that section for the
live design; treat this one as "why we tried this first and what we
learned," same spirit as every other superseded note in this doc.

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

**Crawl-stage build (2026-09-28).** Rather than build all three tiers plus
the full completion-triggered burst at once, Engine 2 ships in three passes
— crawl, walk, run — starting with the smallest slice that produces real,
reviewable drafts. Greg's scope for crawl: the < 60 day tier only, no
real artist-fit scoring, and every draft still goes into his own Gmail for
him to read, pick the final artist, and send by hand. Two things originally
assumed to need new infrastructure turned out not to, once checked against
what Discovery and Refresh had already built:

- **No new Gmail infrastructure.** The original Brittany Elise proof-batch
  plan deferred a real recurring engine to "Phase 2, needs its own
  draft-capable Gmail client — a new JWT service-account client... with
  `gmail.compose` added via Domain-Wide Delegation." That's still true for
  a mature, no-human-in-the-loop production engine, but both the Discovery
  and Refresh scheduled tasks already carry a Gmail connector in their
  `mcp_connections` (unused by either), wired the same way the interactive
  session used for the Brittany Elise drafts was. Crawl reuses that same
  connector on a third scheduled task — zero new Google Workspace admin,
  zero new deploys.
- **No completion-triggered burst yet.** Section 10 describes catch-up as
  firing "once, as a burst, right after a state finishes discovery." Crawl
  doesn't build that event-driven trigger. Because urgency here is purely
  `occurrence_date` minus today, a plain **daily poll** gets the same
  practical result: the moment a state's rows flip `pending_state_review`
  to `false`, anything under 60 days out becomes visible to the very next
  day's run, with no event bus or webhook needed. The real fire-on-
  completion design is left for the 61–179 day tier in walk/run, where
  timing actually matters more.

**Shipped** (migration `catchup_crawl_flag`; scheduled task "Ridge CRM —
Catch-up crawl", daily `CRON_TZ=America/New_York 15 10 * * *`, an hour
after Discovery's 9:15 slot and 30 minutes after Refresh's 9:45 slot, so
same-morning approvals/corrections are visible before Catch-up runs).
Candidate query: `events` joined to `event_occurrences` where
`occurrence_date` is between today and today+60, `archived = false`,
`pending_state_review = false`, `catchup_drafted = false`, and no `plays`
row exists for that `event_id` — that last condition is the crawl-stage
stand-in for "no lineup posted." It's a pure internal-data check (has
Ridge already got a play booked against this event?), deliberately not a
live re-fetch of the event's own source page the way Discovery/Refresh do
— that real "is a lineup actually posted publicly" check is a walk/run
refinement, not a crawl blocker.

For each candidate, the recontact floor from `src/app/actions/outreach.ts`
(`checkRecontactEligibility`) is honored before drafting, and a matching
`outreach_log` row is written after — same 30-day-floor/`recontact_not_before`
logic already proven on the Brittany Elise batch, unmodified. The scheduled
task can't call that Next.js server action directly (it's not running the
app), so its prompt has it read `outreach.ts` once per run and replicate
the same query/insert in SQL, the same "read the source, follow its exact
logic" pattern Discovery already uses for `dateSignalExtraction.ts` and
`recurrence.ts`.

Artist-fit is deliberately not scored — this reuses section 5's existing
availability rule exactly as written, rather than inventing a simplified
version of it. For each candidate event, the task checks every active,
`ridge_books = true` artist against both `plays.show_date` (a confirmed
booking on that date) and that artist's own "Shows – The Ridge" Drive
sheet (`Confirmed`/`Block`/`Blocked` = unavailable; blank/`Open`/`Hold` =
safe to pitch, read by column header per section 5), and drafts around
whichever comes back available. The artist/promo block is still flagged in
the draft as swappable (a bracketed note at the top of the body, meant to
be deleted before sending) since this is an availability filter, not a fit
judgment — Greg picks the actual artist while he's editing anyway, exactly
as he does today.

`events.catchup_drafted` is the new filterable flag (same pattern as
`dedup_uncertain`/`refresh_flagged`), backing a "Catch-Up Drafted" pill on
the Events page. The scheduled task ends with a short digest in the same
style as Discovery/Refresh's — how many checked, how many drafted (event +
recipient + artist), how many skipped and why (recontact floor, no
eligible artist, already booked) — not a review request, since nothing
here needs approval to take effect (the draft already sits in Gmail
unsent, same as every other engine's output).

Deferred to walk/run, unchanged: the 61–179 day tier, the real
completion-triggered burst (useful once timing inside that wider window
starts to matter), real artist-fit/genre scoring, the monthly voice-model
refresh automation, and the real service-account Gmail setup for a
no-human-in-the-loop version of this engine.

**Superseded (2026-10-17) — see the note above Engine 2.**

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

**Date-resolution correction (2026-09-27).** Greg raised a real gap before
it caused any actual damage: the original "is the date/pattern unchanged"
check could be satisfied by a source that simply hadn't posted next year's
date yet, still showing last year's — which reads as "unchanged" but
leaves an event with no genuine future occurrence for Catch-up/Standing
Cadence to act on. Tightened Step 2: before judging anything "unchanged,"
the scheduled task now explicitly checks whether a future occurrence
already exists on file. If not — even when the page's content itself
hasn't visibly changed — it's treated the same as a real date change: the
task infers the recurring pattern from the event's own occurrence history
(same `confirmed_pattern`/forward-scan logic discovery uses) and writes a
genuine future occurrence, rather than re-stamping stale information as
verified. Only falls to a human flag when even pattern-based projection
isn't possible. No code changed — this lives entirely in the scheduled
task's own prompt.

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

**Step 1 (explicit date) was documented but never actually built
(fixed 2026-10-11).** This section always specified step 1 as resolving a
single explicit date in the source text — written month name or numeric
`M/D/YYYY` — straight to `confirmed_date`. That only ever happened in the
one-time Python import script used for the original SC backlog; it never
made it into `src/lib/dateSignalExtraction.ts`, the ongoing module
Discovery and Refresh actually call. In its absence, the module's bare-
month step (4 above) silently swallowed a stated date instead: any
"Month Day" or "Month Day, Year" text matched the bare-month-name check
before anything could look for a day number next to it, and got anchored
to the 1st of that month at `estimated` confidence — wrong, and not
flagged as wrong. Found during Alabama discovery (2026-10-02) by testing
the live script directly against its own prompt example ("October 17,
2026") and getting `day: 1`/`estimated` back, then confirmed against
three more literal-date phrasings, all four wrong the same way. Fixed by
adding `findExplicitDate` (written month) and `findExplicitNumericDate`
(numeric, including a date embedded in a longer timestamp string like
"Fri, 05/08/2026 - 18:00") ahead of the bare-month step, both requiring
exactly one date-like match in the text so a range never gets mistaken
for a single date. The result now carries a third confidence tier,
`confirmed_date` (already a valid `event_occurrences.date_confidence`
value at the DB level, just never reachable from this module), and is
represented as the existing `annual-date` rule shape rather than a new
result type, since "a fixed calendar day every year" is exactly what
`annual-date` already means and keeps every caller's handling unchanged.

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

**Needs Date sharpening pass (2026-09-28).** Greg flagged the weekly
Needs Date digest as unreasonably high (359 events) and asked pointed
questions that turned out to have real causes, not just noise: "are we
trying to find recurring info on private events?", "are we too locked
into a specific set of recurring patterns only?", and two concrete
examples — Carolina Country Music Festival (a well-known early-June
event) and Canton Labor Day Festival (obviously the Monday of Labor Day
every year, and already matched by an existing regex rule in
`dateSignalExtraction.ts` that had simply never been wired up for this
case). His explicit steer: "Good is better than great for this effort...
if it looks like early June every year, let's run with that until we
find out otherwise." Investigation found three compounding, independently
real causes:

1. **Private events were in the view at all.** 142 of the original 369
   rows were private one-off bookings (weddings, parties, corporate
   events) that already have a real `plays` row on file — they can never
   need a projected future date, and checking them was pure wasted
   review effort. Fixed by adding `is_public = true` to
   `events_needing_attention`'s migration and to the Events page's
   "Needs Date" filter query.
2. **`inferAnnualRuleFromDate` (recurrence.ts) was dead code.** It was
   built specifically to infer a same-weekday/ordinal annual fallback
   from a single known past date, but nothing ever called it — a
   recurring series captured with only one `confirmed_date` (very
   common: "Music on Main", "SummerFest Entertainment Series", etc.)
   permanently fell out of Occurrence Rollover's reach the moment that
   one date lapsed, since Rollover only ever projected forward from an
   existing `recurrence_rule`, and these events had none. Fixed by
   wiring it into `rollover-occurrences/route.ts`: any public,
   non-archived event with no `recurrence_rule` but a real past date now
   gets a same-weekday/ordinal annual rule inferred and persisted
   (`estimated`, correctable by the next Refresh), same day it's
   discovered stale. Found and fixed a related bug in the same pass:
   `computeNextOccurrence` only scans forward from its input date, so an
   event whose latest known date was a full cycle or more stale (found
   via "Manning Arts Walk", last dated 2024-10-03) could land on a
   "next" date that was itself still in the past — fixed by advancing
   the scan until the result is genuinely future-dated.
3. **Name-pattern matching (holiday/season/month cues in the event's own
   name) existed in `dateSignalExtraction.ts` but had no dedicated pass
   run against the public zero-occurrence backlog** — some rows, like
   Canton Labor Day Festival, were legacy imports that predated the
   resolution-order fix described above and had simply never been run
   through it.

One-time backfill executed against the live backlog to apply the
sharpened logic retroactively (going forward, Rollover/Discovery/Refresh
keep it current on their own): 31 recurring series with a single stale
`confirmed_date` got an inferred annual rule + projected next occurrence;
12 more resolved by matching holiday/season/month cues in the event's own
name (including Canton Labor Day Festival → 1st Monday of September, and
St. Patrick's Day Celebration, Sara's Farm Adventure - Veterans Day
Celebration, and several month/season-only placeholder estimates in the
spirit of "good is better than great"). The "Carolina Country Music
Festival" / "Carolina Country Music Fest" duplicate Greg called out was
also manually merged: the "Festival" record (which already carried 5
real `plays` and a primary contact) was kept canonical, and the "Fest"
duplicate's correct June recurrence rule and occurrence dates were copied
over before archiving it. Needs Date total: 369 → 227 (private exclusion)
→ 186 (stale-date backfill) → 174 (name-pattern backfill) → 173
(duplicate merge).

The remaining ~173 break down roughly into: genuinely one-off/unresolved
events with no name or date cue at all (need either a source with real
date text or a human look), and a smaller set — about 40 — that already
have an `event_occurrences` row but with `occurrence_date is null` and
`date_confidence = 'unknown'` (a real "no signal at all" outcome, not a
bug). A number of these turned out on inspection to be venues or ongoing
series without a single date (e.g. "Music Farm", "Newberry Opera House",
several taproom/brewery names) rather than genuine single-date events —
flagged here as a data-quality observation, not acted on without Greg's
input, same treatment as the handful of clearly-private-sounding events
("Frat Party", "Theta Chi Party", etc.) found mislabeled `is_public =
true` during this same pass.

**Season-word aperture widened + a real ordering bug fixed
(2026-10-19).** Greg reviewed a Needs Date digest and asked to "open up
the aperture" on season inference: he was seeing events with "summer" or
"fall" right in the name still landing in `unknown`, and asked for
similar words (he named "harvest") to count too. Two real, independent
causes, both in `src/lib/dateSignalExtraction.ts`:

1. `SEASON_WORDS` only recognized the five literal season words
   (spring/summer/fall/autumn/winter) via a strict `\bword\b` match, which
   both missed clear synonyms (harvest, oktoberfest, bloom/blossom) and —
   more consequentially — missed compound names glued directly onto a
   season word with no separator ("Bessemer SummerFest"), since there's
   no word boundary between "Summer" and "Fest". Fixed by adding the
   synonyms to `SEASON_WORDS` and an optional `(?:fest)?` suffix to the
   matching regex. Deliberately left out "holiday" — too generic to
   reliably mean winter (unlike "harvest" for fall) — flag to Greg if he
   wants it added anyway.
2. While testing the above against the live Needs Date backlog, found
   that `resolveDateSignal` checked the ordinal-weekday and bare-weekday
   pattern steps *before* the explicit-stated-date step — so source text
   naming both a weekday word and a literal date ("2026 edition confirmed
   for Saturday, October 3" — the row that caught it, Brushy Mountain
   Apple Festival) matched the weekly-weekday step first and invented a
   fictitious "every Saturday, Sept–Nov" recurring series out of what is
   actually one single annual date. This section's own documented intent
   ("a stated date should always win outright over a guessed pattern")
   was already true against the bare-month step further down, but was
   never actually enforced against the two pattern steps ahead of it.
   Fixed by moving the explicit-date check (both written-month and
   numeric M/D/YYYY forms) to run immediately after the fixed-holiday
   rules, before any pattern-guessing step.

One-time backfill against the live `recurrence_rule IS NULL` backlog
(422 rows in `events_needing_attention` at the time, across every state —
not just a newly-discovered one) using the corrected script, same
approach as the 2026-09-28 sharpening pass: run the real
`scripts/resolve-date-signal.ts` against each row's `name` + `notes`, and
for anything that now resolves, write `recurrence_rule` +
an `event_occurrences` row at the returned confidence, with a `notes`
suffix recording what was inferred and why. One manual exclusion rule
applied during review, not (yet) built into the script itself: any
`weekly`/`monthly` result at `estimated` confidence with no explicit
season/range stated — i.e. inferred from a bare weekday word alone, no
`confirmed_pattern` backing — gets a human glance before writing, since a
one-off mention of a weekday (a fair's single Saturday-night rodeo slot,
say) can read exactly like a real weekly series to the regex. Caught one
real case this way (Caroline-Dorchester County Fair) and left it
`unknown` rather than write a wrong frequency, not just a wrong date.
**Status: done.** Backfilled the entire `recurrence_rule IS NULL` backlog
against the live DB (422 events at the start). Ran the corrected resolver
over every row's `notes`/name text in paginated batches, writing a
`recurrence_rule` + a new `event_occurrences` row for anything it could
resolve, and left the rest `unknown` rather than guess. Along the way,
discovered that the first few batches had been paginated with `OFFSET`
against a shrinking "still unresolved" set — each batch that fixed rows
shifted every later `OFFSET`, silently skipping that many rows forward.
Caught it by noticing a page's first id didn't follow the previous page's
last id, reconstructed every gap this created (there were four, one of
them stretching back to the very start of the id range), and swept all of
them before concluding. Final numbers: 95 events given a real
`recurrence_rule` and a dated occurrence (71 of those in this pass, after
the broadened season-word + reorder fix; 24 from an earlier pass the same
day), split roughly 38 `confirmed_date`, 2 `confirmed_pattern`, 31
`estimated` in this pass alone. 327 events remain `unknown` on purpose —
no date signal anywhere in their name or notes, or (one case,
Caroline-Dorchester County Fair) a bare-weekday-only guess that the manual
exclusion step caught and declined to write. `events_needing_attention`
dropped from 499 to 404 rows as a result.

**Date resolution is now a real, invokable script, not LLM re-derivation.**
Discovery and Refresh's scheduled-task prompts previously told the agent
to read `dateSignalExtraction.ts`/`recurrence.ts` and manually re-derive
their logic each firing — reliable most of the time, but with no
guarantee of matching the actual code, and this gap is the most likely
reason Canton Labor Day Festival went unresolved despite an exact regex
rule already existing for it. `scripts/resolve-date-signal.ts` (new,
`tsx` added as a devDependency to run it) wraps the real
`resolveDateSignal`/`recurrence.ts` exports as a CLI: given a JSON array
of `{id, name, rawDateText, knownDate?}`, it returns the exact same
rule/confidence/explanation/next-occurrence the application code would
produce — see the file's own header comment for the full contract. Both
scheduled tasks (`trig_01DfziVYnGMKJbe1ca5YDuu5` Discovery,
`trig_014mRjyjnfgvpZJQzAa61bL4` Refresh) were updated to call
`npx tsx scripts/resolve-date-signal.ts` for pattern/name-based
resolution instead of re-deriving it by hand. Refresh's history-based
inference (projecting from 2-3 past `event_occurrences` dates when no
text/name signal exists at all — see the Refresh entry above) is a
different algorithm the script doesn't cover, so that case still reasons
directly in the scheduled task's own prompt, clearly marked as a distinct
path from the scripted one.

**Needs Date, round two (2026-09-28, same day).** Two more things Greg
caught by spot-checking what was left after the pass above:

1. **Venues/ongoing programs miscategorized as single-date events.**
   Greg noticed Music Farm and Newberry Opera House on the list and
   asked how many of the rest were the same thing. Re-reading the SC
   research notes for the remaining backlog confirmed it: several notes
   literally said "venue, not single event," and a couple of event
   names had even been tagged `(venue)` by the original researcher.
   Every one of them already had a `venue_id` pointing to a real
   `companies` row of type `venue` carrying the same information (often
   with its own "(private venue)"/"(private brewery)" annotation), so
   the event row was pure duplication, not a source of new information.
   19 events (breweries/taprooms hosting occasional unscheduled live
   music, amphitheaters and theaters bookable via a promoter rather than
   directly, and a couple of multi-venue programs like the Murrells
   Inlet MarshWalk) were archived with
   `disqualified_reason = 'Reclassified: this is a venue/ongoing
   program, not a single-date event...'`, reversible like every other
   disqualification in this system. The venue itself stays fully live in
   `companies` for outreach — nothing about Ridge's actual leads on these
   venues was lost, only the redundant "event" row.
2. **`dateSignalExtraction.ts`'s pattern matching was stricter than the
   real research notes.** Reading the same backlog surfaced several
   events with a genuinely real recurring cadence in their notes that
   the parser missed on a technicality: "First Friday each month" (only
   the literal word "monthly" triggered the ordinal-weekday branch, not
   "each month"), "Thursdays April-Oct" and "Saturdays, ~4:30-8:30pm"
   (a bare weekday needed one of "weekly"/"every"/"nights"/"evenings" to
   trigger — a plain plural weekday mention like "Thursdays" didn't
   count on its own), and "Karaoke every Wed" (weekday abbreviations
   like "Wed"/"Thu" weren't recognized at all, only full names). Fixed:
   added `WEEKDAY_ABBR_WORDS` (source text only, same reasoning as the
   existing month-abbreviation split), dropped the literal-"monthly"
   requirement for an ordinal-weekday pattern stated in source text
   (matching the bar step 5's name-based version already used), and
   treat a plural bare weekday or an explicit month range/season word
   next to it as sufficient recurrence signal on their own. The one real
   ambiguity this introduces — an ordinal-weekday phrase tied to a
   single specific month with no "monthly"/season cue ("the 3rd Saturday
   of October") reads as *annual*, not monthly — is handled explicitly:
   checked first, and produces an `annual` rule instead of a `monthly`
   one. Verified against both the new cases and a regression check
   (Canton Labor Day Festival, from the earlier pass, still resolves
   correctly) before backfilling; re-running the loosened logic against
   the remaining backlog resolved 10 more events. Needs Date: 173 → 154
   (19 venue reclassifications) → 144 (10 more resolved dates).

**`companies.email`** — A general/organizational address (e.g. "City of
Greenville general contact"), distinct from a real contact's own email.
Exists because a source often names an organizer with a public contact
address but no actual person — that's organizer-level information, not a
contact, and previously had nowhere structured to live. Optional; a
company can be created and fully populated without one.

## 2a. Pivot (2026-10-17): Catch-up & Standing Cadence replaced by an in-app Action List

**Why.** The Gmail-draft design above worked (the crawl-stage build did
successfully create one real draft on 2026-09-29), but it was switched off
the next day and never turned back on — found during an unrelated
conversation almost three weeks later, by which point 117 real,
qualifying events had piled up with zero drafts created for any of them.
Separately, Greg flagged the Google API cost/limits (Gmail draft creation,
and the per-artist "Shows – The Ridge" Drive-sheet reads the crawl-stage
availability check depended on) as a real constraint going forward. Rather
than patch the old design, the decision was to replace both Catch-up and
Standing Cadence outright with something that lives entirely in Basecamp:
a left-nav "Action List" that surfaces events for Greg to personally work,
with no Gmail, no Drive, and no LLM involved in the daily mechanics at
all — pure deterministic SQL, same cost profile as `rollover-occurrences`/
`scan-contacts`, not a daily agent session.

**What it replaces, concretely.** No more auto-drafted Gmail pitches of
any kind for the outreach-rhythm engines (Discovery and Refresh are
unaffected — neither one actually used Gmail for real work; the connector
was wired but unused). No more per-artist availability scoring against
each artist's Drive sheet. No more 60-day/180-day tier split, no more
10-region rotation map. One list, one mechanism, Greg decides the artist
and does the actual outreach himself, same as he already does when
reviewing Discovery's output.

**Starting point: 2026-10-17, events from 2027-01-01 on only.** The 103
events already sitting inside the old near-term window (102 under 60 days
out, 1 more before Jan 1) are explicitly abandoned, per Greg's call — no
backfill sweep, no special handling. Confirmed before making that call: 56
of the 103 have a recurrence pattern on file and will resurface on their
own next cycle (Occurrence Rollover projects next year's date once the
current one lapses; Refresh verifies/corrects it against the real source);
the other 47 are one-offs with no pattern, which don't auto-resurface the
same way but do get a genuine second look from Refresh's flat 6-month
safety-net clock (which checks the source page and only flags for a human
rather than guessing), and show up sooner than that in the existing weekly
"Needs Date" digest the moment their only occurrence has no future
counterpart. Nothing here is a silent, permanent loss — see the chat
record for the full reasoning if it's ever questioned later.

**Schema — one new table, `action_items`.**

| Column | Purpose |
|---|---|
| `source` | `auto` (written by the daily population cron, always event-linked) or `manual` (a custom task Greg created himself — see "Custom tasks" below). Governs whether Mark complete writes an `outreach_log` row. |
| `event_id` | The event this item is about. Nullable — null for a custom task with nothing to link, or linked to a different record instead (see below). |
| `occurrence_date` | Set only on `auto` rows, captured at creation and not re-read live — stays stable even if the event's date later shifts underneath it. Null on manual tasks. |
| `title` | Required on `manual` rows (what Greg typed when creating the task); null on `auto` rows, which display the linked event's own name instead. |
| `due_date` | `manual` rows only. Null means "no due date, visible now" — sorts as if due today, same as a HubSpot task with no date set. |
| `company_id` / `contact_id` / `artist_id` | Optional context links for a `manual` task — same nullable-FK shape `outreach_log` already uses. `event_id` covers the event case; these three cover "about a venue," "about a person," or "about an artist" without forcing an event connection that may not exist. |
| `status` | `open` / `completed` / `superseded` (see below — no `dismissed`; dismissing is just a snooze, not a status). |
| `hidden_until` | Set by Dismiss; the row stays `open`, just invisible until this date passes. Null means visible now. |
| `completed_at` | Set on completion. |
| `outreach_log_id` | Points at the `outreach_log` row written on completion, if any (`auto` rows only — see "Custom tasks"). |
| `notes` | Free text; used today for the system-written "superseded by newer occurrence" breadcrumb below, and optionally for a manual task's own description. |

Unique on `(event_id, occurrence_date)` — Postgres treats `NULL` as
distinct from any other value in a unique index by default, so every
`manual` row (`event_id` null) is naturally exempt rather than needing a
partial-index workaround.

**Dismiss (2026-10-17, revised per Greg's review).** Original design had
two separate actions — a no-date "dismiss until next year" status for
recurring events, and a "snooze to a date" for everything else. Greg
pushed back on both the split and a wrong implication in how it was
written up: dismissing an action item never touches the event or its
occurrence at all, recurring or not — it only ever marks *this
`action_items` row*. That's actually what the original design already did
(the schema never wrote to `events`/`event_occurrences`), just phrased
confusingly ("dismiss until next year ... relies on the unique constraint
for natural resurfacing"). Replaced with one button, **Dismiss**, that
pops a small duration picker — **Next week / Next month / 90 days / 180
days / Next year**, plus a custom date picker as a last resort — modeled
directly on an unrelated outside tool Greg pointed to as the catalyst for
this whole feature. Whatever's picked just sets `hidden_until`; the row
stays `status = 'open'` the entire time, in every case, recurring event or
one-off — no more special-casing by `recurrence_rule`. Asked Greg whether
a true *permanent* "not a fit, never show this again" dismissal was also
needed; he confirmed no — a far-future custom date covers that case well
enough, and it keeps the model honest with "nothing here is a silent,
permanent loss."

**What a long Dismiss actually means (clarified 2026-10-17).** For the
short presets (next week, next month) Dismiss is a literal snooze — not
ready to work this yet, remind me later about this same occurrence. For
the long ones (90 days, 180 days, Next year) Greg's framing is different
and more accurate: it's not "come back on this exact calendar date," it's
"I'm not pitching *this* occurrence, but reserve the right to pitch this
event the next time it comes around" — i.e., tied to the event's own
cycle, not a fixed day count. `hidden_until` still gets set (so there's a
hard ceiling on how long a row can stay invisible even if nothing else
happens), but the real resurfacing mechanism for a long dismiss is meant
to be the event's *next actual occurrence* showing up, however soon that
turns out to be — see Supersede below, which is what actually delivers
this.

**Multi-occurrence check (2026-10-17, per Greg).** Flagged a real gap in
the above: some events/series run more than once a year (a spring date
and a fall date, say) with both occurrence rows already on file at once.
Because the population cron (below) only ever creates one open item per
event at a time — for the single *soonest* future `occurrence_date` — a
90+ day Dismiss on the spring instance would otherwise sit on its
`hidden_until` clock with no idea a fall instance is already sitting
right there, within the window, waiting. Fix: whenever Dismiss is applied
with a target 90+ days out, the action — before saving — checks
`event_occurrences` for this same `event_id` for any *other* occurrence
date later than the one being dismissed but earlier than the requested
target. If one exists, `hidden_until` is capped to that date instead of
the full request, and the confirmation tells Greg why ("This event also
has an Oct 12 date on file — bringing this back then instead, so that one
doesn't get buried under a year-long dismiss"). If there's no such date
on file, the full requested duration is used as-is. This only applies to
event-linked items; it has no meaning for a custom task (below).

**Supersede (new, caught while resolving the above).** Working through
Greg's question surfaced a real gap: because `hidden_until` can now push a
row's visibility out a full year, and because the population job below
inserts a *new* row for a *new* `occurrence_date` without touching any
existing row for that event, a recurring event can end up with two open
`action_items` rows at once — an old one (possibly snoozed, possibly just
never actioned) still pointing at an occurrence that's since passed, and
a fresh one for the real next occurrence once Rollover/Refresh advances
it. That's not only a Dismiss problem — the same thing happens to any
long-untouched item once its event quietly rolls over. Fixed in the
population query itself: before inserting a new row, it closes out any
other still-`open` row for the same event whose `occurrence_date` is
older than the one just found, marking it `status = 'superseded'` with a
`notes` breadcrumb. Superseded rows are never visible, never counted, and
never write to `outreach_log` — they're bookkeeping, not a user action,
which is why `superseded` is a separate status from `dismissed`/`open`
rather than reusing either.

**Population — a plain daily cron, not an agent session.** New route
`/api/cron/populate-action-items`, same shape as the existing
`rollover-occurrences` cron (`CRON_SECRET` bearer auth, deterministic
SQL, no external API calls):

```sql
-- 1. Close out any older still-open item an event already has once a
--    newer occurrence is about to get its own row -- see "Supersede" above.
update action_items ai
set status = 'superseded',
    notes = 'Superseded by a newer occurrence as of ' || current_date
from events e
join event_occurrences o on o.event_id = e.id
  and o.occurrence_date = (
    select min(o2.occurrence_date) from event_occurrences o2
    where o2.event_id = e.id and o2.occurrence_date >= current_date
  )
where ai.event_id = e.id
  and ai.source = 'auto'
  and ai.status = 'open'
  and ai.occurrence_date < o.occurrence_date
  and o.occurrence_date between current_date and current_date + 180
  and o.occurrence_date >= '2027-01-01';

-- 2. Insert this cycle's row for every qualifying event that doesn't
--    already have one (on conflict handles the case where it does).
insert into action_items (source, event_id, occurrence_date)
select 'auto', e.id, o.occurrence_date
from events e
join event_occurrences o on o.event_id = e.id
  and o.occurrence_date = (
    select min(o2.occurrence_date) from event_occurrences o2
    where o2.event_id = e.id and o2.occurrence_date >= current_date
  )
where e.archived = false
  and e.pending_state_review = false
  and o.occurrence_date between current_date and current_date + 180
  and o.occurrence_date >= '2027-01-01'
  and not exists (select 1 from plays p where p.event_id = e.id)
on conflict (event_id, occurrence_date) do nothing;
```

The `>= '2027-01-01'` clause is permanent in the query, not a one-time
backfill filter — it only actually excludes anything during the rest of
2026 and becomes a no-op the moment the calendar passes Jan 1, so there's
no special-casing to remove later. An event also drops off the *visible*
list automatically (not via this insert) the moment a `plays` row exists
for it, however that booking came about — Greg shouldn't have to manually
clear something he already booked through some other path.

**Item actions.**

- **Mark complete** — `status = 'completed'`, `completed_at = now()`. For
  an `auto` (event-linked) row, also writes a real `outreach_log` row
  (`company_id`/`contact_id` from the event, `event_id`, `sent_at =
  now()`) so the existing 30-day recontact floor and outreach history
  both keep working exactly as they do for every other source. `artist_id`
  is optional at this step (nullable on `outreach_log` already) — filled
  in only if Greg already knows who he pitched; this list never
  pre-computes artist fit the way the crawl engine used to. For a
  `manual` task, completing it is just that — a finished to-do, not a
  claim that outreach happened, so no `outreach_log` row gets written even
  if the task happens to be linked to an event (see "Custom tasks" below
  for why that distinction matters).
- **Dismiss** — opens the duration picker (Next week / Next month / 90
  days / 180 days / Next year / custom date), sets `hidden_until`
  accordingly (capped by the multi-occurrence check above, for `auto`
  rows with another known occurrence sooner than the request). `status`
  stays `open`; nothing about the event or its occurrence is touched. The
  item reappears in the active list on its own once `hidden_until`
  passes — same mechanism for every row, `auto` or `manual`.

**Custom tasks (2026-10-17, per Greg).** A "+ New Task" button on the
Action List page opens a small form — title (required), notes (optional),
due date (optional, defaults to none = visible immediately), and an
optional link to one existing record (event, company, contact, or
artist — reusing the same relation-picker component already used
elsewhere in Base Camp, e.g. the plays form). Saves as a `manual` row:
`title`/`due_date`/`notes` filled in, `event_id` set only if an event was
the chosen link (`company_id`/`contact_id`/`artist_id` for the other
three), `occurrence_date` left null. This is the HubSpot-task-style
escape hatch Greg asked for — "call the venue back about capacity,"
"confirm Brittany's availability before pitching," anything that isn't
itself a pitch opportunity the cron would ever generate on its own.
Deliberately reuses the exact same Mark complete / Dismiss mechanics as
`auto` rows (see above) rather than inventing a parallel system — a task
is just a row with no `occurrence_date` and a `title` instead of an event
to borrow one from.

**UI.** New left-nav entry ("Action List" for now — easy to rename),
count badge same convention as every other nav item (`status = 'open'`
and `hidden_until` null or in the past — `superseded`/`completed` rows
never count, same as before, regardless of `source`). New page, one list,
`auto` and `manual` rows mixed together (not split into separate tabs —
Greg's call: it's one daily list to work, not two places to check),
sorted by `coalesce(occurrence_date, due_date, current_date)` ascending —
a `manual` task with no due date sorts as "due today," landing at the top
alongside the most urgent event items rather than getting lost at the
bottom. Each row: event name (linking to `/events/[id]`) or the task's
own `title`; for an `auto` row, venue + city/state, contact email/phone
(contact if one's on file, otherwise the venue company's), and a link out
to the event's own source page (falling back to the venue's website —
virtually every event has at least one of the two); for a `manual` row,
its `notes` and a link to whatever record it's tied to, if any; and the
two actions above (Mark complete, Dismiss) on every row regardless of
`source`.

**Decommissioned as part of this pivot:** the disabled "Ridge CRM —
Catch-up crawl" scheduled task (`trig_01FvupzKcozyhnXpCvL2Nqos`) and its
Gmail/Drive wiring, retired outright rather than left dormant; the two
far-future one-off reminders ("Follow up: Finlay Fridays (2027 season)",
"Follow up: Pickens Appalachian Folk Festival (2027)") updated so they
don't surprise-draft via Gmail once they fire in 2027.

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

**Cross-state false-positive fix (2026-09-28).** GA, SC, and NC's research
logs all independently flagged the same pattern: small towns across
different states often reuse the same generic event/org name ("Music on
Main," "Town of X," "Festival...") for genuinely unrelated things. Greg's
intent was always that a confirmed different city AND state means a
distinct real-world entity, matched or not — and the functions did encode
that, but only for the `questionable` tier. NC's run exposed the actual
gap: an exact or near-exact name match (similarity > 0.85) short-circuited
straight to `auto_link` before the city/state check ever ran, so "Music on
Main" in Monroe, NC matched 100% against "Music on Main" in Spartanburg,
SC and came back `auto_link` — a real different-state collision slipping
through as a confirmed match. Fixed by checking the city+state divergence
before tier assignment, not after, in both `find_company_match` and
`find_event_match` (event matching still lets a matching `venue_id`
override a text-only city/state mismatch, since that reflects a data-entry
wrinkle rather than a genuinely different event). No bad merge had actually
reached live data — the NC firing used its own judgment to insert a new
row and flag it rather than trust the returned `auto_link` tier — but the
function itself needed the fix so that judgment call isn't the only thing
standing between this and a silent merge next time.

**Domain-based company matching (2026-09-29).** Added a HubSpot-style
identity signal alongside name similarity: `find_company_match` now takes
optional `p_email`/`p_website` parameters, extracts the bare domain from
whichever is given (`extract_domain`, a small parser that strips protocol,
`www.`, path, port, and any `@`-prefix), and treats a shared real domain
between the candidate and an existing company as a strong match signal —
so a renamed event series or an org listed under a slightly different name
still links correctly when the underlying website/email domain is the
same. A same-domain match can push a candidate to `auto_link` even at a
fairly low name-similarity score (`domain_match and sim > 0.4`) — the 0.4
floor exists so two genuinely unrelated orgs that happen to share a
domain (e.g. two departments of the same city government, or two
tenants of the same registrar's parked-page domain) don't get silently
merged just because the domain lines up; below that floor they still
insert as a new, separately reviewable row rather than auto-linking, with
the breadcrumb calling out the shared domain explicitly (a different kind
of "worth checking" than a coincidental name collision). A denylist of
~20 common consumer webmail domains (`is_generic_email_domain` — Gmail,
Yahoo, Outlook, iCloud, etc.) is excluded from the signal entirely, since
most small-town organizers use personal addresses and a shared Gmail
domain says nothing about common ownership. This is deliberately not
about email deliverability/sending-domain concepts (SPF/DKIM) — purely an
identity-matching signal, same spirit as the name/geo signals already in
place. `find_event_match` and the visibility-gate mechanics below are
unchanged; only company matching gained this signal, since events don't
carry their own website/email. Discovery's Step 4a now passes
`p_email`/`p_website` whenever the organizer/venue candidate has one.

Two bugs surfaced and were fixed while building this, both from directly
testing edge cases rather than from a live incident: (1) Postgres sorts
`NULL` *first* in `ORDER BY <boolean> DESC` by default, so an unrelated
company with no website/email at all (`domain_match` evaluating to `NULL`)
was outranking the true domain match in candidate selection — fixed by
wrapping every `domain_match` expression in `coalesce(..., false)`; (2)
`CREATE OR REPLACE FUNCTION` doesn't replace a function whose parameter
list changed, it adds a second overload — the original 3-argument
`find_company_match` was still live alongside the new 5-argument version
until the stale overload was explicitly dropped, which briefly made calls
ambiguous. Both are the kind of thing worth a repeat lint before other
`find_*_match`-style functions ever change signature again.

That "repeat lint" caught two more, this time in `find_event_match`,
found during Alabama discovery (2026-10-02) and fixed the same day via
the `fix_event_match_venue_null_and_3word_geo_gap` migration: (1) the
exact NULL-vs-false bug named above as a risk, except in `venue_match`
instead of `domain_match` — `find_event_match` never got the
`coalesce(..., false)` fix `find_company_match` already had, so when a
new event's organizer was already resolved to a real `venue_id` but the
*candidate* match had `venue_id IS NULL`, the cross-state exclusion guard
silently didn't fire (`NULL` reads as "don't block"). Caught live on
"Boaz Harvest Festival" almost auto-linking to an unrelated "Harvest
Festival" in Lawrenceville, GA. (2) The `>= 3-word-name, similarity >
0.75` auto-link tier never checked `venue_match`/`geo_match` at all,
unlike every other tier rule — so two different-city, same-state events
with a generic multi-word name could auto-link on name alone. Caught
live on "Fall Concerts in the Park" (Guntersville) vs. "Concerts in the
Park" (Huntsville) at 81% similarity — neither pair shares a real venue
(confirmed against the actual rows: different company, different city,
one has no venue on file at all), they just scored high on name text
alone. First fix added the same `coalesce` and gated the 3-word tier on
`(venue_match or geo_match)`, same as the `sim > 0.6` tier just above it;
Greg's call minutes later was that the gated version still wasn't worth
keeping — this project's real data has thrown enough generic multi-word
collisions ("Concerts in the Park," "Festival...," "City of X") that a
bare word-count/similarity heuristic isn't a helpful signal even within
the same city, gated or not. Removed the branch entirely
(`remove_event_match_3word_name_only_tier`) rather than keep tightening
it — anything that would have hit it now falls through to `questionable`
same as any other borderline match, which never blocks discovery, it
just gets a human glance via `dedup_uncertain`. Verified directly against
live data after both migrations (the two real examples above return no
match / `questionable`, and a genuine same-venue repeat still returns
`auto_link` cleanly through the `venue_match`/`geo_match` branch).

**Fixed (2026-10-16), per Greg's go-ahead.** `find_company_match` had the
identical `sim > 0.75 and >= 3 words` auto-link branch with no
`domain_match`/`geo_match` check, copied from the same original pattern as
the event-side bug above. Not confirmed against a live false-positive
before fixing — same as the event-side case, this kind of bug leaves no
trace to audit for after the fact (the would-be-duplicate row simply never
gets created) — so this was fixed proactively rather than waiting for one.
Removed the branch entirely (migration
`remove_company_match_3word_name_only_tier`) rather than gating it, same
call Greg already made on the event-side version: this project's real data
throws too many generic multi-word collisions for a bare word-count/
similarity heuristic to be a useful signal here, gated or not. Anything
that would have hit this tier now falls through to `questionable`, same as
any other borderline match — never blocks discovery/quick-create, just
surfaces for a human glance via `dedup_uncertain`.

**Audited (2026-10-11), no confirmed damage found.** Checked all
already-approved states (SC/GA/NC/TN/VA/FL/AL) for `events.state`
disagreeing with `companies.state` via `venue_id` — the signature a
wrongly cross-state-merged event/venue pair would leave if the bug above
had already fired on live data before being caught. One real flag
turned up ("Supermodels Unlimited," tagged `state = SC` with `city =
Asheville`, venue "The Biltmore" correctly tagged NC) plus one unrelated
and clearly out-of-scope row (an event/company pair both tagged
Ontario/Canada, not a US state at all) — neither looks like a product of
this specific bug, more likely a state field set from the state being
researched rather than the venue's real location. This audit technique
has a real limitation worth naming: a genuinely wrongly-merged event
would leave no trace at all (the would-be-duplicate row simply never
gets created), so this can rule out one specific signature, not prove
nothing was ever merged.

**Both corrected (2026-10-11), per Greg.** "Supermodels Unlimited"'s
`state` corrected to `NC` to match its venue and its own city
(Asheville) — its `country` was already correctly `USA`. The Canada
entry stays, properly labeled rather than removed: both `events` and
`companies` already have a `country` column (default `'USA'`), just
unused correctly here — the event row already had `state: "Ontario"`/
`country: "Canada"` right, but the company row had `"Canada"` sitting in
`state` (a country name in the wrong field), `country` left at the
`USA` default, and the province folded redundantly into `city`
("Jackson Point, Ontario"). Corrected the company row to `city: "Jackson
Point"`, `state: "Ontario"`, `country: "Canada"`, matching the event
row's shape. This is also the first confirmation `country` exists and
is meant to be used this way — worth keeping in mind if Engine 1 ever
expands past "state by state within the US" on purpose (it hasn't; this
one row was a scope slip, not an expansion).

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

**Incident + fix (2026-10-12): a real offer vanished with zero trace.** Ben
Hooker (Boho Links, Chapin SC) told Greg he'd submitted an offer; nothing
showed up anywhere -- no `plays` row, no email, no error. Root cause: the
honeypot anti-bot field (`companyUrl` on the `/book` form, hidden from real
visitors) had been filled in -- almost certainly by browser autofill, not
an actual bot -- and the old code's response to a filled honeypot was to
report success to the visitor while silently discarding the entire
submission, with no record of it anywhere, not even for us to find
afterward. Confirmed via direct query that no `plays` row existed for this
or any other submission in the relevant window; traced the only code path
(`submitOfferInquiry` in `src/app/actions/offerIntake.ts`) that produces
exactly this symptom (apparent success, zero DB writes, zero emails) to
that honeypot branch.

Two-part fix, both approved by Greg:

1. **Safety-net log, migration `offer_inquiry_attempt_safety_net_log`.**
   New table `offer_inquiry_attempts` + two `SECURITY DEFINER` RPCs
   (`log_offer_inquiry_attempt`, `update_offer_inquiry_attempt`). Every
   `/book` submission is now saved to this table the instant it's
   received -- before the honeypot check or any validation runs -- so a
   real submission can never again disappear without a trace, regardless
   of what later logic does with it. RLS is enabled with zero policies
   (write-only through the two RPCs; no `SELECT` grant to `anon`/
   `authenticated`), so this isn't a new publicly-readable surface --
   reviewed via direct SQL same as everything else in this project. Each
   row is later updated in place with how the submission was handled
   (`ok`, `blocked_bot`, `validation_error`, `rpc_error`) and the
   resulting `play_id` when there is one.
2. **Honeypot now needs a second signal before it discards anything.**
   `BookForm.tsx` captures `Date.now()` the moment the form mounts
   (`renderedAt`) and sends it through with the submission.
   `submitOfferInquiry` only treats the honeypot as a real bot -- and
   skips the insert -- when the field is filled **and** the whole form
   was submitted in under `HONEYPOT_MIN_HUMAN_MS` (2500ms), too fast for
   someone who actually read and typed into the form. A filled honeypot on
   a normally-paced submission is logged as `honeypot_triggered = true`
   but is no longer discarded -- it's processed as a real offer, same as
   before the honeypot existed at all. This directly targets the autofill
   false-positive: a script that fills every field and submits
   immediately still gets caught; a human whose browser quietly populated
   one hidden field no longer loses their submission over it.

Verified against the three cases this needs to tell apart: a clean human
submission (no honeypot, logged + processed normally); a scripted bot
(honeypot filled, fast, blocked and logged as `blocked_bot`, visitor still
told "success" so it has no signal it was caught); and the Ben Hooker case
(honeypot filled, normal human pace, logged as `honeypot_triggered: true`
but processed through to a real `plays` row and notification, exactly as
it should have the first time).

Known gap, not addressed by this fix: `sendNewOfferEmail`'s own failures
are still only `console.error`'d, never surfaced to Greg or retried (see
`src/lib/approvalEmail.ts`) -- if a real submission saves correctly but the
notification email itself fails to send, nothing currently tells anyone
that happened. Flagged for later (section 11); out of scope for this pass,
which was specifically about submissions that never reach the database at
all.

**Second incident + fix (2026-10-15): a stale tab bypasses the safety net
entirely.** Three days after the fix above shipped, Ben resubmitted for
Boho Links -- using the same link Greg had originally sent him -- and it
again produced zero trace, including in the brand-new safety-net log,
which should catch *everything*. Ruled out a bad deploy directly: opened
the live `/book` page myself and ran a real end-to-end test submission
through it (clearly marked, cleaned up after), which logged and completed
correctly (`outcome: ok`), proving the 2026-10-12 fix was live and working.

That left one failure mode that still produces exactly this symptom --
*nothing* reaches the server, not even the safety net, because the
request never gets sent at all: Next.js Server Actions are tied to the
specific deployment that rendered the page. A tab or bookmarked link left
open/unused across a deploy is still running the old page's JavaScript,
which references a Server Action ID that no longer exists once a new
version has shipped -- clicking Submit throws instead of calling anything,
client-side, before the request ever leaves the browser. The old
`BookForm.tsx` had no `try/catch` around that call at all, so this failed
completely silently: stuck on "Submitting…", nothing logged, nothing
shown, no error anywhere for us to find. Greg's fair pushback: a prospect
like Ben shouldn't need to know to "refresh and try again," and asking him
to submit a third time was not acceptable.

Fix (`BookForm.tsx` + `book/page.tsx`), no DB/migration changes needed:
- `book/page.tsx` now sets `export const dynamic = "force-dynamic"`,
  explicit insurance against this route ever being served from a cache
  (it already behaved this way implicitly via the DB call in
  `listBookableArtists`, but this makes it impossible to regress by
  accident).
- `BookForm.tsx` now autosaves the in-progress form to `sessionStorage` on
  every change (`saveDraft`/`loadDraft`/`clearDraft`, key
  `book-form-draft-v1`), restored via the initial `useState(loadDraft)` --
  safe during SSR because `loadDraft`'s own `try/catch` falls back to
  `initialState` wherever `sessionStorage` doesn't exist, and because React
  doesn't hydration-warn on a mismatched controlled-input *value*
  specifically (the same leniency that already lets browser autofill
  coexist with SSR).
- The submit call is now wrapped in `try/catch`. A thrown error (the stale
  Server Action case) now lands on a new `"stale"` status: a plain message
  ("This page has been open a while and needs to reload... nothing you've
  entered will be lost") with a single "Reload & continue" button that
  calls `window.location.reload()`. The reload fetches the current
  deployment's Server Action IDs, and the `loadDraft()` initializer
  restores everything they'd already typed -- they resubmit with nothing
  retyped and no need to understand what happened.

Deliberately not pursued: migrating this form off Server Actions onto a
plain API route, which would sidestep the deployment-ID problem entirely
rather than catching and recovering from it. Flagged as a possible future
hardening step (section 11) if this recurs, but a larger change than this
incident warranted on its own.

**Recurring health check added (2026-10-15).** Both incidents above only
surfaced because Greg happened to notice a missing email and asked. Nothing
was watching the safety-net log itself. Added a daily scheduled task (Claude
Code Remote trigger `trig_016YVz8R9vvH1vi2rHLmDsJb`, `CRON_TZ=America/New_York
48 8 * * *`, push + email notifications) that scans `offer_inquiry_attempts`
for the last 26 hours every morning: flags anything with `outcome` of
`rpc_error`/`validation_error`/`NULL` (a NULL outcome means a row was logged
but never updated -- something crashed mid-request) in detail, lists
`blocked_bot` rows briefly in case one looks like it could've been a real
person, and lists every clean `ok` submission so Greg can cross-check he
actually received the notification email for each. Stays quiet (one or two
sentences) on a clean day; only goes into detail on actual anomalies.

**Silent email-notification failures, fixed (2026-10-16).** The gap flagged
above and in section 11 -- `sendApprovalEmail`/`sendApprovalResponseEmail`/
`sendNewOfferEmail` (`src/lib/approvalEmail.ts`) only ever `console.error`'d
a Resend failure, with nothing surfacing to Greg and nothing retried.
Two-part fix, same safety-net-log pattern as `offer_inquiry_attempts`:

1. **New table + RPC, migration `email_notification_failure_log`.**
   `email_notification_failures` (`email_kind`, `recipient`, `context`
   jsonb, `error_detail`) + `SECURITY DEFINER` function
   `log_email_notification_failure`, same write-only-via-RPC/zero-RLS-
   policy shape as the `/book` safety net. All three functions in
   `approvalEmail.ts` now call it on any send failure.
2. **A real correctness bug fixed along the way, not just logging added.**
   All three functions previously only checked the `error` field Resend's
   SDK *returns* -- none of them wrapped the `resend.emails.send(...)` call
   itself in a `try`/`catch`. If the SDK call *throws* instead (a network
   error, for instance) rather than resolving with `{ error }`, that
   exception used to propagate straight out of these functions uncaught.
   Every call site awaits them bare with no surrounding `try`/`catch` of
   its own (`records.ts`, `approval.ts`), so an uncaught throw would have
   failed the whole server action -- for `sendApprovalEmail`, that's the
   same action that writes `approval_token`/`approval_email_sent_at` right
   after; for `sendApprovalResponseEmail`, that's the *public*
   `/approve/[token]` response action an outside venue/management contact
   hits with no Base Camp login, after their approve/decline decision has
   already been committed via RPC -- a thrown, uncaught error there risked
   showing them a broken page over what was really just a notification
   problem. Now wrapped in `try`/`catch`, so a thrown error is caught,
   logged (both `console.error` and the new table), and never rethrown --
   matching the already-documented invariant that a notification failure
   must never block or roll back the real state change.

Surfaced via the existing daily health check rather than a new cron:
renamed "Book offer-intake health check" → "Base Camp notification health
check" (same trigger, `trig_016YVz8R9vvH1vi2rHLmDsJb`, unchanged schedule),
prompt extended with a Part B that reports every `email_notification_failures`
row from the last 26 hours alongside the existing `/book` check. This also
closes the specific gap the Part A clean-submission note used to flag: a
failure now has somewhere to show up instead of only a server log nobody's
watching; actual delivery (opened, not bounced) still isn't tracked, since
Resend's API only confirms the send was accepted, not opened -- noted once
in the health check's own prompt rather than re-litigated here.

## 9. Geographic sequencing

Two related but separate sequencing questions — one per engine.

**Engine 1 (discovery)** works state by state in priority order: Southeast
first, then Midwest, then Northeast, then the rest of the country.
Confirmed as good enough to start; refined against two real signals as it's
finalized — drive-time/tour-routing distance from Nashville, where most of
the roster lives and where touring economics actually run (the dominant
factor), with existing Basecamp relationship density (`companies`/`plays`
already on the books) as a tiebreaker. Deliberately prioritizes
artist-routing economics over Greg's own location in Boise.

**Resolved (2026-09-29).** The full ordered state list is now seeded in
`discovery_progress` (`priority_order` 0-50, all 50 states + DC, SC/GA/NC
already `approved` at 0-2) — Greg's own call, radiating out from the
Southeast cluster: the rest of the Southeast next (TN, VA, FL, AL, then
MS, KY, WV, AR, LA), DC/MD/DE bridging into the Northeast (PA through ME),
most of the Midwest, then a jump out to ID/WA/OR before finishing the
Midwest's plains states, then Texas/Oklahoma and the rest of the
Mountain/Southwest/Pacific states, ending on AK/HI. Since Discovery's
`fire_trigger` self-chaining already just picks the lowest `priority_order`
row that's `pending`/`in_progress`, seeding this list once means it now
runs the entire country end to end without ever needing a state named
again — no separate geographic-distance logic was needed for that.

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
- ~~The concrete 10-region map for Engines 2 & 3.~~ Moot as of the
  2026-10-17 pivot (section 2a) — the region-rotation design it would have
  fed is superseded.
- **Enforcing/verifying the "unknown is a last resort" rule from section
  12.** The contract says a dateless event should be rare, not a default,
  but nothing currently checks that this actually holds — a firing that
  falls back to `unknown` produces no signal anywhere (not in its digest,
  not in any dashboard), so a dateless event has no `event_occurrences`
  row to compute a window from and could sit unpitchable indefinitely with
  no one noticing — true of the old Engine 2/3 design and equally true of
  the Action List (section 2a), which also only ever populates from a real
  future occurrence. Options discussed but not decided: have each firing report its
  own dateless-event count in its digest; add a standing "no known
  occurrence" view/counter in Basecamp so it's visible independent of any
  one digest; or require a `refresh_flagged`-style note explaining what was
  checked whenever `unknown` is used, instead of a silent default.
- ~~`find_company_match`'s ungated 3-word auto-link tier.~~ Fixed
  2026-10-16 — see section 4.
- ~~Silent email-notification failures.~~ Fixed 2026-10-16 — see section 8.
- **`/book` still runs on Next.js Server Actions.** The 2026-10-15 fix
  (section 8) catches and recovers from a stale-tab submission rather than
  eliminating the possibility of one. Moving this form to a plain API route
  would remove the deployment-ID fragility entirely; worth doing if this
  class of issue recurs, but not pursued yet since the recovery fix covers
  the actual failure.

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

## 13. Financial reporting — Ridge's revenue tracker

A separate initiative from the outreach engines above, started when Greg
asked (2026-10-17) to add an Admin area to the sidebar, move Candidates
into it, and start tracking Ridge's own revenue and effectiveness. This
section covers the financial-reporting half; effectiveness metrics are a
later to-do once outreach volume (`outreach_log`, `action_items`) is high
enough for a conversion rate to mean anything.

**Scope, settled through conversation with Greg (2026-10-17 to
2026-10-19):**

- This tracks **Ridge's own commission revenue**, not the artist's gross
  take, and only the plays actually created through Base Camp itself
  (`plays.status != 'legacy'`). The 555 rows imported from the old
  spreadsheet (all Cody Webb, see below) predate Ridge's own commission
  tracking here and stay out of this number — but they're exactly what
  feeds the separate historical-by-year trend (next section).
- **Commission basis**: booking commission = `guarantee_amount` only,
  merch excluded — a booking agent's cut is conventionally of the deal,
  not the merch table. Management commission (only for artists flagged
  `ridge_manages`) = `guarantee_amount + gross_merch_sales` — merch
  included, since a manager's cut conventionally covers everything the
  artist earns from the show, not just the guarantee.
- **Rate resolution**: a play-level `management_commission_pct` /
  `booking_agent_commission_pct` always overrides the artist's own
  default when present. When neither is set and that commission type
  applies to the artist (`ridge_manages`/`ridge_books`), the leg is
  flagged missing and excluded from the totals — **never silently treated
  as a zero commission.** Verbatim from Greg: "When no commission info is
  present on the play record, always default to the artist profile. Never
  assume that blank equals zero." Brittany Elise is flagged
  `ridge_manages = true` with no `management_commission_pct` set, and
  Greg confirmed (2026-10-19) to leave that as-is for now — her management
  leg is correctly absent from the total, not zeroed out.
- **Three-stage lifecycle, reusing the existing play pipeline** (see
  `src/lib/playStatus.ts`) rather than a new status column:
  - **Booked / Projected** — any play from `offer_submitted` through
    `confirmed`.
  - **Earned** — `played`. The show actually happened.
  - **Settled** — `played` → `settled` is a manual Kanban-board move for
    now (per Greg, 2026-10-19) and is the natural future home for an
    invoice/collection flag — not built yet ("more to come" on that).
  - `declined`/`cancelled` are excluded entirely — a deal that fell
    through was never real revenue.
- **Confirmed → Played auto-advances.** Originally scoped as a manual
  board move, but Greg caught (2026-10-19) that waiting on a human defeats
  the point — "Cody has a play on 11/1, I log in on 11/2, this should have
  moved on its own." **Shipped**: Postgres function
  `advance_confirmed_plays_to_played()` (`confirmed` → `played` where
  `show_date < current_date`), called by a new daily cron
  (`/api/cron/advance-plays-to-played`, `0 8 * * *` UTC, `vercel.json`).
  Deliberately narrow: a play still stuck at an earlier stage when its
  show_date passes never got a real confirmation, so it's left alone
  for a human to look at rather than guessed into `played`.
- **Historical by-year trend** (lower priority, per Greg): all 555 legacy
  rows belong to Cody Webb (verified against the data, not assumed —
  Greg asked "those are all Cody's right?"). Two running totals per
  artist per year, off every play with a show (legacy included): annual
  `guarantee_amount` total, and a separate annual
  `guarantee_amount + gross_merch_sales` total — tracking growth both
  ways, no commission math involved (this is gross artist earnings, not
  Ridge's cut). ~6% of legacy plays (34 of 555) have no `show_date` and
  land in an "Undated" bucket per artist rather than being silently
  dropped.
- **Dashboard** (`/revenue`, in the new Admin nav section): Ridge's
  Booked/Earned/Settled totals with a show count, filterable by Current
  YTD / Prior Year / All Time / custom range off `show_date` — defaults to
  All Time rather than YTD, since real bookings are often dated months
  out and a Jan-1-to-today window can look empty even with real booked
  business on the calendar. A play missing a commission rate is excluded
  from every total and called out in a banner instead of silently
  undercounting; same treatment for a play missing a `show_date` (can't
  be placed in any range, "All Time" included).

**Open / not yet decided:**

- Whether `settled` should gain its own automated trigger (e.g. a
  deposit/final-payment field flipping it) or stay a manual call
  indefinitely.
- The actual invoice-sending step `settled` is meant to set up — not
  designed yet, per Greg: "more to come though."
- Effectiveness metrics (outreach conversion, pipeline velocity, Discovery
  efficiency, Action List throughput) — deferred until there's enough
  volume in `outreach_log`/`action_items` for a conversion rate to be
  meaningful.

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc.
