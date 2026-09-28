import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { computeNextOccurrence, inferAnnualRuleFromDate, describeRule, type RecurrenceRule } from "@/lib/recurrence";

// Daily occurrence rollover. See docs/outreach-engine-plan.md section 2,
// "Occurrence rollover" -- this is deliberately separate from the 12-month
// annual Refresh (which re-checks a source_url for accuracy). Refresh runs
// on a scale of months and only fires per-event 12 months after that
// event's own discovered_at; nothing else guarantees a *future-dated*
// event_occurrences anchor exists at the moment Engine 2 (catch-up) or
// Engine 3 (standing cadence) actually need one to compute days-out from.
// Without this, an event whose only known occurrence has already passed
// sits invisible to both engines until its refresh happens to land inside
// the right window -- which can arrive after that year's booking window
// has already closed (first caught importing a Sept 2026 SC tracker row
// whose only known date had already passed by import time).
//
// This route only ever INSERTS new `estimated` rows. It never edits or
// deletes a `confirmed_date`/`confirmed_pattern` row -- correcting a wrong
// estimate against the real source is Refresh's job, not this one's.
//
// Triggered by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=` query
// param is also accepted for manual/local testing.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function toDateOnly(iso: string): Date {
  // occurrence_date comes back from Postgres as "YYYY-MM-DD" -- parse as
  // UTC midnight rather than through the Date constructor's local-time
  // parsing of bare date strings in some environments.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();
  const today = todayUTC();

  // Two groups now, not one. Group A: events that already have a
  // recurrence_rule -- rollover's original job. Group B (new): public
  // events with NO recurrence_rule but a single past confirmed_date and
  // nothing future -- these used to sit invisible to rollover forever
  // ("a one-time event with a single confirmed_date never gets a
  // projected successor"), which is exactly why obviously-recurring named
  // series (Music on Main, SummerFest Entertainment Series, Party in the
  // Park...) were silently falling into Needs Date the moment their one
  // known date lapsed, even though nothing about them looked one-off. Per
  // Greg (2026-09-28): good is better than great here -- infer a same-
  // weekday/ordinal annual fallback from that one known date via
  // recurrence.ts's inferAnnualRuleFromDate (built for exactly this, never
  // wired in until now) rather than leaving the event to go dark. Always
  // `estimated`, always correctable by the next Refresh pass. Restricted
  // to is_public = true -- a private one-off booking (wedding, private
  // party) is never a recurring series and shouldn't get a fabricated
  // future date.
  const { data: events, error: eventsError } = await supabase
    .from("events")
    .select("id, name, recurrence_rule, is_public, notes")
    .eq("archived", false)
    .eq("pending_state_review", false)
    .or("recurrence_rule.not.is.null,is_public.eq.true");

  if (eventsError) {
    console.error("rollover-occurrences: failed to load events", eventsError);
    return NextResponse.json({ ok: false, error: "failed to load events" }, { status: 500 });
  }

  const eventList = (events ?? []) as {
    id: string;
    name: string;
    recurrence_rule: RecurrenceRule | null;
    is_public: boolean;
    notes: string | null;
  }[];
  if (eventList.length === 0) {
    return NextResponse.json({ ok: true, eventsChecked: 0, inserted: 0, fallbackRulesInferred: 0 });
  }

  const { data: occurrences, error: occurrencesError } = await supabase
    .from("event_occurrences")
    .select("event_id, occurrence_date, source_url")
    .in(
      "event_id",
      eventList.map((e) => e.id)
    )
    .not("occurrence_date", "is", null);

  if (occurrencesError) {
    console.error("rollover-occurrences: failed to load occurrences", occurrencesError);
    return NextResponse.json({ ok: false, error: "failed to load occurrences" }, { status: 500 });
  }

  // Latest known occurrence per event (any confidence), plus whether that
  // latest row already has a source_url worth carrying forward as
  // "based on" evidence for the new estimated row.
  const latestByEvent = new Map<string, { date: Date; sourceUrl: string | null }>();
  for (const occ of occurrences ?? []) {
    const date = toDateOnly(occ.occurrence_date as string);
    const existing = latestByEvent.get(occ.event_id as string);
    if (!existing || date.getTime() > existing.date.getTime()) {
      latestByEvent.set(occ.event_id as string, { date, sourceUrl: (occ.source_url as string | null) ?? null });
    }
  }

  const toInsert: {
    event_id: string;
    occurrence_date: string;
    date_confidence: "estimated";
    source_url: string | null;
    discovered_at: string;
  }[] = [];
  const ruleUpdates: { id: string; recurrence_rule: RecurrenceRule; notes: string }[] = [];
  const skippedNoOccurrences: string[] = [];

  for (const event of eventList) {
    const latest = latestByEvent.get(event.id);
    if (!latest) {
      // No occurrence rows at all -- a true "needs date" case, whether or
      // not it has a recurrence_rule. Nothing to project from, so flag
      // rather than guess (this is expected/common now that Group B pulls
      // in every public event, not a bug).
      skippedNoOccurrences.push(event.id);
      continue;
    }
    // Nothing to do if the most recent known date is still in the future --
    // there's already a live anchor for Engine 2/3 to find.
    if (latest.date.getTime() >= today.getTime()) continue;

    // Group B: no recurrence_rule on file, but a real past date to build
    // one from. Infer the fallback annual rule right here (rather than
    // just once, ad hoc) so it's persisted going forward and every future
    // firing takes the normal Group A path for this event.
    let rule = event.recurrence_rule;
    if (!rule) {
      rule = inferAnnualRuleFromDate(latest.date);
      const note = `Rollover (${toDateOnlyString(today)}): no recurrence_rule on file, only a single past date (${toDateOnlyString(latest.date)}). Inferred "${describeRule(rule)}" from that date as a starting estimate -- correct via the next Refresh pass if wrong.`;
      ruleUpdates.push({
        id: event.id,
        recurrence_rule: rule,
        notes: event.notes ? `${event.notes}\n\n${note}` : note,
      });
    }

    // A single forward-scan from `latest.date` finds the next date the
    // rule matches after that specific date -- correct when latest.date
    // is recent, but an event whose only known occurrence is a year or
    // more stale (e.g. discovered_at long ago, never refreshed) can land
    // on a "next" date that's itself still in the past. Keep advancing
    // until it's genuinely in the future rather than inserting a second
    // stale occurrence.
    let next = computeNextOccurrence(rule, latest.date);
    while (next && next.getTime() < today.getTime()) {
      next = computeNextOccurrence(rule, next);
    }
    if (!next) {
      console.error(`rollover-occurrences: could not compute next occurrence for event ${event.id}`, rule);
      continue;
    }

    toInsert.push({
      event_id: event.id,
      occurrence_date: toDateOnlyString(next),
      date_confidence: "estimated",
      source_url: latest.sourceUrl,
      discovered_at: new Date().toISOString(),
    });
  }

  // Persist inferred fallback rules before inserting the occurrences that
  // depend on them, so a failure here leaves nothing half-applied.
  let fallbackRulesInferred = 0;
  for (const update of ruleUpdates) {
    const { error } = await supabase
      .from("events")
      .update({ recurrence_rule: update.recurrence_rule, notes: update.notes })
      .eq("id", update.id);
    if (error) {
      console.error(`rollover-occurrences: failed to persist inferred rule for event ${update.id}`, error);
      continue;
    }
    fallbackRulesInferred++;
  }

  let inserted = 0;
  if (toInsert.length > 0) {
    const { data, error } = await supabase.from("event_occurrences").insert(toInsert).select("id");
    if (error) {
      console.error("rollover-occurrences: insert failed", error);
      return NextResponse.json({ ok: false, error: "insert failed", attempted: toInsert.length }, { status: 500 });
    }
    inserted = data?.length ?? 0;
  }

  return NextResponse.json({
    ok: true,
    eventsChecked: eventList.length,
    inserted,
    fallbackRulesInferred,
    skippedNoOccurrences: skippedNoOccurrences.length,
  });
}
