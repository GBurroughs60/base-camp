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
//         "confidence": "confirmed_pattern" | "estimated",
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
import { resolveDateSignal } from "../src/lib/dateSignalExtraction";
import { computeNextOccurrence, describeRule, inferAnnualRuleFromDate, type RecurrenceRule } from "../src/lib/recurrence";

type Candidate = {
  id: string;
  name: string;
  rawDateText?: string | null;
  knownDate?: string | null;
};

type Result =
  | { id: string; matched: false }
  | {
      id: string;
      matched: true;
      source: "pattern" | "single-date-fallback";
      rule: RecurrenceRule;
      rule_description: string;
      confidence: "confirmed_pattern" | "estimated";
      explanation: string;
      next_occurrence: string;
    };

function todayUTC(): Date {
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

function resolveOne(candidate: Candidate, today: Date): Result {
  const resolved = resolveDateSignal(candidate.rawDateText ?? null, candidate.name);
  if (resolved) {
    const next = nextFutureOccurrence(resolved.rule, today, today);
    if (!next) return { id: candidate.id, matched: false };
    return {
      id: candidate.id,
      matched: true,
      source: "pattern",
      rule: resolved.rule,
      rule_description: describeRule(resolved.rule),
      confidence: resolved.confidence,
      explanation: resolved.explanation,
      next_occurrence: toDateOnlyString(next),
    };
  }

  if (candidate.knownDate) {
    const known = parseDateOnly(candidate.knownDate);
    const rule = inferAnnualRuleFromDate(known);
    const next = nextFutureOccurrence(rule, known, today);
    if (!next) return { id: candidate.id, matched: false };
    return {
      id: candidate.id,
      matched: true,
      source: "single-date-fallback",
      rule,
      rule_description: describeRule(rule),
      confidence: "estimated",
      explanation: `No recurrence pattern stated anywhere -- only a single past date (${candidate.knownDate}) on file. Inferred "${describeRule(rule)}" from that date as a starting estimate; correct via the next Refresh pass if wrong.`,
      next_occurrence: toDateOnlyString(next),
    };
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

main();
