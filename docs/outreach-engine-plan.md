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

**Refresh.** Annual, per event — not tied to the region cycle. Each event's
refresh comes due 12 months after its `discovered_at` date, checked against
its `source_url` rather than a blind re-scrape: what's new, what's stopped
happening, is the contact still right, is the recurrence pattern ("every
Thursday, March–October") still accurate.

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
`discovered_at` is also what the annual refresh counts 12 months from.

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

Locked in, in scope. The public offer-intake form (`/book`) is a separate,
unauthenticated path where any outside venue or promoter submits an offer
directly. It writes venue name/address/city/state as free text straight
onto the new `plays` row through a database function that never touches
`companies`, and the buyer's own company only gets a loose exact-name
match-or-create — both sides sit outside every rule above by construction.
A venue we've already researched and verified can submit through `/book`
and land as a second, disconnected representation of the same real place.

Fix: run both the venue and the buyer-company fields on every incoming
`/book` submission through the same fuzzy-match-before-create step used
everywhere else (see Identity & dedup) — auto-link clean matches, queue the
rest for a quick human confirm. Same review-queue pattern as `candidates`,
reused rather than reinvented. In scope for this build.

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

## Keeping this in sync

As pieces of this get implemented, update this file in the same commits as
the code that implements each piece, so the doc and the code never drift
apart. A stale plan doc is worse than no plan doc.
