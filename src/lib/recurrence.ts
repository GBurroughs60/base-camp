// Shared recurrence math for events.recurrence_rule (jsonb). Used by both
// the occurrence-rollover cron (src/app/api/cron/rollover-occurrences) and
// any import/discovery path that needs to infer or project a pattern (see
// docs/outreach-engine-plan.md, "Occurrence rollover" and "Discovery output
// contract"). One implementation so the two never drift apart.
//
// All dates are handled as UTC calendar dates (no time-of-day, no local
// timezone) since an event's date is a calendar concept, not an instant --
// a "2nd Saturday of September" pattern should mean the same date
// everywhere regardless of what timezone a cron job happens to run in.

export type RecurrenceRule =
  | {
      frequency: "annual";
      /** 1-12 */
      month: number;
      /** 0 (Sun) - 6 (Sat) */
      weekday: number;
      /** 1st-4th occurrence of that weekday in the month, or -1 for "last" */
      ordinal: 1 | 2 | 3 | 4 | -1;
    }
  | {
      // A fixed calendar day every year (July 4th, Dec 25th) -- distinct
      // from "annual" above, which is anchored to a weekday/ordinal
      // instead of a specific day-of-month. Added for holiday-named events
      // (see nameDateHints.ts) where the day is fixed but no source ever
      // states a weekday pattern, since there isn't one.
      frequency: "annual-date";
      /** 1-12 */
      month: number;
      /** 1-31 */
      day: number;
    }
  | {
      frequency: "weekly";
      weekday: number;
      /** 1-12, inclusive. seasonStartMonth > seasonEndMonth means the season wraps the year (e.g. Nov-Feb). */
      seasonStartMonth: number;
      seasonEndMonth: number;
    }
  | {
      frequency: "monthly";
      weekday: number;
      ordinal: 1 | 2 | 3 | 4 | -1;
      seasonStartMonth: number;
      seasonEndMonth: number;
    };

function utcDate(year: number, month0: number, day: number): Date {
  return new Date(Date.UTC(year, month0, day));
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

// 1-based position of `d`'s weekday within its month (the 2nd Saturday ->
// 2), independent of `ordinal`'s sign.
function forwardOrdinalInMonth(d: Date): number {
  return Math.floor((d.getUTCDate() - 1) / 7) + 1;
}

// True when `d` is the last occurrence of its weekday within its month.
function isLastOfMonth(d: Date): boolean {
  const next = addDays(d, 7);
  return next.getUTCMonth() !== d.getUTCMonth();
}

function ordinalMatches(d: Date, ordinal: 1 | 2 | 3 | 4 | -1): boolean {
  return ordinal === -1 ? isLastOfMonth(d) : forwardOrdinalInMonth(d) === ordinal;
}

function monthInSeason(month: number, seasonStartMonth: number, seasonEndMonth: number): boolean {
  return seasonStartMonth <= seasonEndMonth
    ? month >= seasonStartMonth && month <= seasonEndMonth
    : month >= seasonStartMonth || month <= seasonEndMonth; // wraps the year
}

function matchesRule(d: Date, rule: RecurrenceRule): boolean {
  const month = d.getUTCMonth() + 1;
  // annual-date has no weekday component -- checked on month/day alone,
  // before the weekday guard below (which every other variant needs).
  if (rule.frequency === "annual-date") {
    return month === rule.month && d.getUTCDate() === rule.day;
  }
  if (d.getUTCDay() !== rule.weekday) return false;
  switch (rule.frequency) {
    case "annual":
      return month === rule.month && ordinalMatches(d, rule.ordinal);
    case "weekly":
      return monthInSeason(month, rule.seasonStartMonth, rule.seasonEndMonth);
    case "monthly":
      return monthInSeason(month, rule.seasonStartMonth, rule.seasonEndMonth) && ordinalMatches(d, rule.ordinal);
  }
}

// Infers an "annual, same weekday/ordinal" rule from a single known date --
// e.g. Sept 12, 2026 (a Saturday) -> "2nd Saturday of September, annually".
// This is the fallback used when a source only ever gave us one date and we
// don't have (or don't yet have) an explicit recurrence statement to draw
// on; callers should mark occurrences built from it as `estimated`, never
// `confirmed_pattern` -- see docs/outreach-engine-plan.md section 3.
export function inferAnnualRuleFromDate(date: Date): RecurrenceRule {
  return {
    frequency: "annual",
    month: date.getUTCMonth() + 1,
    weekday: date.getUTCDay(),
    ordinal: isLastOfMonth(date) ? -1 : (forwardOrdinalInMonth(date) as 1 | 2 | 3 | 4),
  };
}

// Finds the next date strictly after `afterDate` (UTC calendar date) that
// satisfies `rule`. Scans forward day by day rather than doing closed-form
// month/year arithmetic -- event counts are small and this runs at most
// once a day per event, so simplicity and obvious correctness win over
// cleverness. Returns null only if nothing matched within ~2.2 years,
// which should never happen for a well-formed rule (a bug/malformed rule
// is the only realistic cause).
export function computeNextOccurrence(rule: RecurrenceRule, afterDate: Date): Date | null {
  const start = utcDate(afterDate.getUTCFullYear(), afterDate.getUTCMonth(), afterDate.getUTCDate() + 1);
  const SCAN_DAYS = 800;
  for (let i = 0; i < SCAN_DAYS; i++) {
    const d = addDays(start, i);
    if (matchesRule(d, rule)) return d;
  }
  return null;
}

// Human-readable summary for notes/review UI, e.g. "2nd Saturday of
// September, annually" or "Every Thursday, Apr-Aug".
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const ORDINAL_WORDS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "last" };

export function describeRule(rule: RecurrenceRule): string {
  switch (rule.frequency) {
    case "annual":
      return `${ORDINAL_WORDS[rule.ordinal]} ${WEEKDAY_NAMES[rule.weekday]} of ${MONTH_NAMES[rule.month - 1]}, annually`;
    case "annual-date":
      return `${MONTH_NAMES[rule.month - 1]} ${rule.day}, annually`;
    case "weekly":
      return `Every ${WEEKDAY_NAMES[rule.weekday]}, ${MONTH_NAMES[rule.seasonStartMonth - 1]}–${MONTH_NAMES[rule.seasonEndMonth - 1]}`;
    case "monthly":
      return `${ORDINAL_WORDS[rule.ordinal]} ${WEEKDAY_NAMES[rule.weekday]} of every month, ${MONTH_NAMES[rule.seasonStartMonth - 1]}–${MONTH_NAMES[rule.seasonEndMonth - 1]}`;
  }
}
