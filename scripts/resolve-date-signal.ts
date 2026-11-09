// Real, invokable CLI wrapper around resolveDateSignal (src/lib/dateSignalExtraction.ts)
// and the recurrence-projection helpers (src/lib/recurrence.ts). Built per
// Greg (2026-09-28): the Discovery and Refresh scheduled tasks were reading
// this repo's date-resolution source and re-deriving its logic by hand
// inside an LLM session each firing -- reliable most of the time, but not
// guaranteed to match the actual code, and the gap is exactly what let
// "Canton Labor Day Festival" (a name that matches an existing exact regex
// rule in dateSignalExtraction.ts) slip through unresolved during a
// legacy import. This script runs the real TypeScript, not a re-derivation
// of it, so a scheduled task's output is byte-identical to what the
// same logic would produce if called from application code.
//
// Usage:
//   npx tsx scripts/resolve-date-signal.ts < candidates.json > results.json
//   npx tsx scripts/resolve-date-signal.ts candidates.json > results.json
//
// Input: a JSON array of candidate events, each shape:
//   {
//     "id": string,                     // any stable identifier (event id, temp key)
//     "name": string,                   // event name
//     "rawDateText"?: string | null,    // free-text date notes from the source, if any
//     "knownDate"?: string | null       // "YYYY-MM-DD" -- a single past confirmed date
//                                        // to fall back to (inferAnnualRuleFromDate) when
//                                        // neither rawDateText nor name yields a pattern.
//                                        // Omit/null if there's no known date at all.
//   }
//
// Output: a JSON array, one entry per input row, in the same order:
//   - No signal anywhere:
//       { "id": ..., "matched": false }
//   - Resolved (from rawDateText/name via resolveDateSignal, or from
//     knownDate via inferAnnualRuleFromDate when nothing else matched):
//       {
//         "id": ...,
//         "matched": true,
//         "source": "pattern" | "single-date-fallback",
//         "rule": RecurrenceRule,
//         "rule_description": "1st Monday of September, annually",
//         "confidence": "confirmed_date" | "confirmed_pattern" | "estimated",
//         "explanation": "...",
//         "next_occurrence": "YYYY-MM-DD"   // next occurrence strictly after today,
//                                            // advanced past any stale match
//       }
//
// This script only ever produces `estimated`/`confirmed_pattern` recurrence
// rules and their next projected occurrence -- it never touches the
// database itself. The caller (a scheduled task, or a one-off backfill) is
// responsible for writing the results to events.recurrence_rule /
// event_occurrences via the normal SQL path, same as every other write in
// this project.

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { resolveDateSignal } from "../src/lib/dateSignalExtraction";
import { computeNextOccurrence, describeRule, inferAnnualRuleFromDate, type RecurrenceRule } from "../src/lib/recurrence";

export type Candidate = {
  id: string;
  name: string;
  rawDateText?: string | null;
  knownDate?: string | null;
};

export type Result =
  | { id: string; matched: false }
  | {
      id: string;
      matched: true;
      source: "pattern" | "single-date-fallback";
      rule: RecurrenceRule;
      rule_description: string;
      confidence: "confirmed_date" | "confirmed_pattern" | "estimated";
      explanation: string;
      next_occurrence: string;
    };

export function todayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parseDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// A single forward scan from a stale anchor date can still land on a "next"
// date that's itself in the past (e.g. a knownDate a year or more old).
// Keep advancing until the result is genuinely in the future. Same fix
// applied in src/app/api/cron/rollover-occurrences/route.ts -- kept
// identical here rather than factored out, since this file intentionally
// has zero runtime dependency on the Next.js app itself.
function nextFutureOccurrence(rule: RecurrenceRule, afterDate: Date, today: Date): Date | null {
  let next = computeNextOccurrence(rule, afterDate);
  while (next && next.getTime() < today.getTime()) {
    next = computeNextOccurrence(rule, next);
  }
  return next;
}

function patternResult(id: string, resolved: NonNullable<ReturnType<typeof resolveDateSignal>>, today: Date): Result | null {
  const next = nextFutureOccurrence(resolved.rule, today, today);
  if (!next) return null;
  return {
    id,
    matched: true,
    source: "pattern",
    rule: resolved.rule,
    rule_description: describeRule(resolved.rule),
    confidence: resolved.confidence,
    explanation: resolved.explanation,
    next_occurrence: toDateOnlyString(next),
  };
}

function singleDateFallbackResult(id: string, knownDate: string, today: Date): Result | null {
  const known = parseDateOnly(knownDate);
  const rule = inferAnnualRuleFromDate(known);
  const next = nextFutureOccurrence(rule, known, today);
  if (!next) return null;
  return {
    id,
    matched: true,
    source: "single-date-fallback",
    rule,
    rule_description: describeRule(rule),
    confidence: "estimated",
    explanation: `No recurrence pattern stated anywhere -- only a single past date (${knownDate}) on file. Inferred "${describeRule(rule)}" from that date as a starting estimate; correct via the next Refresh pass if wrong.`,
    next_occurrence: toDateOnlyString(next),
  };
}

// Precedence: a SPECIFIC resolved result (confirmed_date/confirmed_pattern,
// or a name-only cue that actually read a stated pattern/exact day -- e.g.
// ordinal-weekday-in-name, a named holiday) always wins outright, same as
// before this function existed. But resolveDateSignal's three bare
// last-resort name cues (monthInName, seasonInName, isSeriesName -- see
// their comments in dateSignalExtraction.ts) invent an arbitrary day-1
// anchor from nothing more than a month/season word, or just "concert"/
// "music", sitting in the title -- resolved.placeholder is true for
// exactly those three. A real confirmed past occurrence
// (candidate.knownDate) is strictly better evidence than that kind of
// guess, so it's preferred over a placeholder result (but still loses to
// knownDate missing or failing to project forward, in which case the
// placeholder guess is used as a last resort rather than giving up).
//
// Bug this fixes: every one of these shapes used to beat a real
// knownDate every time, because the old code only ever consulted
// knownDate when resolveDateSignal returned null outright -- so "Plaza
// Summer Concert Series" (seasonInName: "summer") or "Concert for
// Legends" (isSeriesName's bare "concert" catch-all) got the generic
// "May 1st, estimated" placeholder even when a real confirmed date was
// sitting right there in knownDate. Caught during Ohio Discovery
// (2026-11-09) -- several events needed a hand workaround for exactly
// this (see their event research_log entries) before this fix existed.
export function resolveOne(candidate: Candidate, today: Date): Result {
  const resolved = resolveDateSignal(candidate.rawDateText ?? null, candidate.name);

  if (resolved && !resolved.placeholder) {
    const r = patternResult(candidate.id, resolved, today);
    if (r) return r;
  }

  if (candidate.knownDate) {
    const r = singleDateFallbackResult(candidate.id, candidate.knownDate, today);
    if (r) return r;
  }

  if (resolved) {
    const r = patternResult(candidate.id, resolved, today);
    if (r) return r;
  }

  return { id: candidate.id, matched: false };
}

function main() {
  const inputPath = process.argv[2];
  const raw = inputPath ? readFileSync(inputPath, "utf8") : readFileSync(0, "utf8");
  const candidates: Candidate[] = JSON.parse(raw);
  const today = todayUTC();
  const results = candidates.map((c) => resolveOne(c, today));
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
  const matched = results.filter((r) => r.matched).length;
  process.stderr.write(`resolve-date-signal: ${matched}/${results.length} matched\n`);
}

// Only run the CLI (and its blocking stdin read) when this file is
// executed directly -- `npx tsx scripts/resolve-date-signal.ts`. Guard
// added 2026-11-09 alongside the exported resolveOne/Candidate/Result
// above, which the new test file imports: without this guard, importing
// this module for a unit test ran `main()` as a side effect of the import
// and hung forever on `readFileSync(0)` waiting for stdin that was never
// going to arrive.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
