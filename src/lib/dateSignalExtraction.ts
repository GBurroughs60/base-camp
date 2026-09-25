// Extracts recurrence signal from two text sources every SC-style research
// row (and, going forward, every Engine 1 discovery row) already carries:
// the source's own free-text date notes, and the event's own name. Built
// after the pilot import revealed the parser was only ever looking for a
// single explicit date and falling back straight to "needs manual review"
// the moment it didn't find one -- even on rows where the source text
// plainly stated a recurrence pattern ("3rd Saturday monthly", "Friday
// nights in season") or the event's own name carried an obvious date cue
// ("4th of July Festival", "Sounds of Summer"). See
// docs/outreach-engine-plan.md, "Date/pattern extraction order".
//
// Two confidence tiers, matching event_occurrences.date_confidence:
//   - confirmed_pattern: the pattern came from the SOURCE's own date text
//     (a weekday/ordinal/frequency phrase actually written there).
//   - estimated: any part of the rule had to be filled in from something
//     other than the source stating it outright -- the event's name, or a
//     partial source statement completed with a guessed season window.
//     Expected to be corrected by the next Refresh pass, same as any
//     other estimate.
//
// This module only extracts *rules*, never a specific future date -- it
// deliberately does not invent "the 2027 date" the way a source explicitly
// warned against (see the Easley 4th of July Festival import notes).
// Projecting a rule to its next actual occurrence is computeNextOccurrence
// in recurrence.ts.

import type { RecurrenceRule } from "./recurrence";

export type DateSignalConfidence = "confirmed_pattern" | "estimated";

export type DateSignalResult = {
  rule: RecurrenceRule;
  confidence: DateSignalConfidence;
  /** Human-readable note for event.notes explaining what was inferred and from where. */
  explanation: string;
};

const WEEKDAY_WORDS: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

const ORDINAL_WORDS: Record<string, 1 | 2 | 3 | 4 | -1> = {
  "1st": 1, first: 1,
  "2nd": 2, second: 2,
  "3rd": 3, third: 3,
  "4th": 4, fourth: 4,
  last: -1,
};

const MONTH_WORDS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// Abbreviated forms ("Apr", "Aug", "Sept") -- source date text very
// commonly gives season ranges this way ("May-Aug", "Apr 2-Aug 27"), and
// the explicit-range extractor needs to catch those too rather than
// falling through to a much less useful year-round default.
const MONTH_ABBR_WORDS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
function resolveMonthWord(word: string): number | undefined {
  const w = word.toLowerCase();
  return MONTH_WORDS[w] ?? MONTH_ABBR_WORDS[w];
}
const MONTH_PATTERN_ALL = [...Object.keys(MONTH_WORDS), ...Object.keys(MONTH_ABBR_WORDS)].join("|");

// Meteorological seasons -- a plain, defensible default. Refresh corrects
// the real window once the source's actual pattern is checked; this is
// only ever a starting anchor, never presented as fact.
const SEASON_WORDS: Record<string, { start: number; end: number }> = {
  spring: { start: 3, end: 5 },
  summer: { start: 6, end: 8 },
  fall: { start: 9, end: 11 },
  autumn: { start: 9, end: 11 },
  winter: { start: 12, end: 2 },
};

// Fixed-date holidays common in community festival names, where the event
// itself genuinely tends to land on or very near that exact day (a "4th of
// July Festival" really is on/near July 4th; "Trunk or Treat"/Halloween
// events really do cluster on Oct 31 or its nearest weekend). Deliberately
// excludes movable-feast holidays that need weekday/ordinal math instead
// (Thanksgiving/Memorial/Labor/MLK, handled separately below), and
// deliberately excludes bare "Christmas" -- a "Christmas Parade" or
// "Christmas on Main" is almost never literally held on December 25th
// (that's a family holiday, not a town-event day); bare Christmas mentions
// are handled as a month-only cue further down instead, alongside every
// other bare month name, rather than claiming a specific day that's very
// likely wrong.
const HOLIDAY_DATES: Array<{ pattern: RegExp; month: number; day: number; label: string }> = [
  { pattern: /\b(4th|fourth) of july\b|\bindependence day\b/i, month: 7, day: 4, label: "July 4th" },
  { pattern: /\bchristmas eve\b/i, month: 12, day: 24, label: "Christmas Eve" },
  { pattern: /\bchristmas day\b/i, month: 12, day: 25, label: "Christmas Day" },
  { pattern: /\bhalloween\b/i, month: 10, day: 31, label: "Halloween" },
  { pattern: /\bnew year'?s eve\b/i, month: 12, day: 31, label: "New Year's Eve" },
  { pattern: /\bnew year'?s\b/i, month: 1, day: 1, label: "New Year's Day" },
  { pattern: /\bst\.?\s?patrick'?s\b/i, month: 3, day: 17, label: "St. Patrick's Day" },
  { pattern: /\bveterans?\s?day\b/i, month: 11, day: 11, label: "Veterans Day" },
  { pattern: /\bcinco de mayo\b/i, month: 5, day: 5, label: "Cinco de Mayo" },
];

// Holiday names that describe a season/theme rather than a specific day --
// resolve to a month-only anchor (day 1), same tier as a bare month name.
const HOLIDAY_MONTH_ONLY: Array<{ pattern: RegExp; month: number; label: string }> = [
  { pattern: /\bchristmas\b/i, month: 12, label: "Christmas" },
];

// Holidays that fall on a computed weekday/ordinal rather than a fixed
// date -- expressed directly as "annual" rules (weekday + ordinal + month).
const HOLIDAY_WEEKDAY_RULES: Array<{ pattern: RegExp; rule: RecurrenceRule; label: string }> = [
  { pattern: /\bmemorial\s?day\b/i, rule: { frequency: "annual", month: 5, weekday: 1, ordinal: -1 }, label: "Memorial Day (last Monday of May)" },
  { pattern: /\blabor\s?day\b/i, rule: { frequency: "annual", month: 9, weekday: 1, ordinal: 1 }, label: "Labor Day (1st Monday of September)" },
  { pattern: /\bthanksgiving\b/i, rule: { frequency: "annual", month: 11, weekday: 4, ordinal: 4 }, label: "Thanksgiving (4th Thursday of November)" },
  { pattern: /\bm\.?l\.?k\.?\b|\bmartin luther king\b/i, rule: { frequency: "annual", month: 1, weekday: 1, ordinal: 3 }, label: "MLK Day (3rd Monday of January)" },
];

function findOrdinalWeekday(text: string): { weekday: number; ordinal: 1 | 2 | 3 | 4 | -1 } | null {
  const ordinalPattern = Object.keys(ORDINAL_WORDS).join("|");
  const weekdayPattern = Object.keys(WEEKDAY_WORDS).join("|");
  const re = new RegExp(`\\b(${ordinalPattern})\\s+(${weekdayPattern})s?\\b`, "i");
  const m = text.match(re);
  if (!m) return null;
  return { ordinal: ORDINAL_WORDS[m[1].toLowerCase()], weekday: WEEKDAY_WORDS[m[2].toLowerCase()] };
}

// "Friday nights", "every Thursday", "Thursdays" -- a bare recurring
// weekday with no ordinal, implying weekly rather than monthly.
function findBareWeekday(text: string): { weekday: number } | null {
  const weekdayPattern = Object.keys(WEEKDAY_WORDS).join("|");
  const re = new RegExp(`\\b(${weekdayPattern})s?\\b`, "i");
  const m = text.match(re);
  if (!m) return null;
  return { weekday: WEEKDAY_WORDS[m[1].toLowerCase()] };
}

function findSeasonWindow(text: string): { start: number; end: number; word: string } | null {
  for (const [word, range] of Object.entries(SEASON_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) return { ...range, word };
  }
  return null;
}

function findExplicitMonthRange(text: string): { start: number; end: number } | null {
  // Finds the first two distinct month-word occurrences (full or
  // abbreviated -- source text commonly gives ranges like "May-Aug" or
  // "Apr 2-Aug 27, 2026") and requires a range separator ("-", an en/em
  // dash, or "to") somewhere in the text between them, tolerating an
  // optional trailing day number and punctuation on the first month
  // ("Apr 2-Aug 27").
  const monthRe = new RegExp(`\\b(${MONTH_PATTERN_ALL})\\b\\.?`, "gi");
  const matches = [...text.matchAll(monthRe)];
  if (matches.length < 2) return null;
  const between = text.slice((matches[0].index ?? 0) + matches[0][0].length, matches[1].index ?? 0);
  // The gap between the two months must be JUST a separator (optional day
  // number, dash, or "to") and nothing else -- otherwise this is two
  // unrelated month mentions (e.g. "blues-Feb, Americana folk-June" tags
  // each month to a different theme; the hyphen there belongs to a label,
  // not a range) rather than an actual "May-Aug"-style range.
  const isRangeSeparator = /^[\s,]*\d{0,2}[\s,]*[-–—][\s,]*$/.test(between) || /^\s+to\s+$/i.test(between);
  if (!isRangeSeparator) return null;
  const start = resolveMonthWord(matches[0][1]);
  const end = resolveMonthWord(matches[1][1]);
  if (!start || !end) return null;
  return { start, end };
}

// A single confident month mention -- deliberately refuses to guess when
// the text names TWO OR MORE months (even ones that don't cleanly parse as
// an explicit range above), since picking one side of an apparent range or
// multi-month mention as "the" month is worse than not guessing at all.
// Caught on a real pilot row: "Year-round, Sept 2026-June 2027 posted"
// isn't a clean range (the 4-digit year sits in the gap), but grabbing
// "June" alone as if it were a single-month statement was actively wrong.
function findBareMonthWith(text: string, pattern: string): { month: number } | null {
  const matches = [...text.matchAll(new RegExp(`\\b(${pattern})\\b\\.?`, "gi"))];
  if (matches.length !== 1) return null;
  const month = resolveMonthWord(matches[0][1]);
  return month ? { month } : null;
}

// Source date text: full or abbreviated ("Sept", "Mid-May") -- research
// notes commonly abbreviate.
function findBareMonthInText(text: string): { month: number } | null {
  return findBareMonthWith(text, MONTH_PATTERN_ALL);
}

// Event names: full names only. Abbreviations risk false hits on a name
// that happens to contain one ("Jan's Diner", "Mar-a-Lago"-style names) --
// a real month is spelled out in an event title far more often than
// abbreviated, so this loses little real signal while avoiding that risk.
function findBareMonthInName(text: string): { month: number } | null {
  return findBareMonthWith(text, Object.keys(MONTH_WORDS).join("|"));
}

/**
 * Attempts to resolve a recurrence rule from a source's free-text date
 * notes plus the event's own name, in order from most to least confident.
 * Returns null only when neither text has any usable date/pattern signal
 * at all (the event genuinely needs manual review -- see
 * events_needing_attention).
 *
 * Deliberately does NOT attempt to extract a single explicit date here --
 * that's a separate, simpler regex pass callers should try first (see
 * parse_pilot.py's parse_explicit_date), since a stated date is always
 * confirmed_date and should win outright over any pattern.
 */
export function resolveDateSignal(rawDateText: string | null, eventName: string): DateSignalResult | null {
  const text = rawDateText ?? "";

  // 1. Named federal-holiday-on-a-weekday patterns, checked against both
  //    texts -- these are exact rules already, no season/day guessing
  //    needed.
  for (const { pattern, rule, label } of HOLIDAY_WEEKDAY_RULES) {
    if (pattern.test(text) || pattern.test(eventName)) {
      return { rule, confidence: "estimated", explanation: `Inferred from "${label}" mentioned in the ${pattern.test(text) ? "source date text" : "event name"}.` };
    }
  }

  // 2. An ordinal-weekday pattern actually stated in the source text
  //    ("3rd Saturday monthly") -- confirmed_pattern, since the source
  //    said it outright. Season window: use an explicit month range if
  //    also stated, otherwise a season word if stated, otherwise default
  //    to year-round (many "monthly" series with rotating themes run all
  //    12 months, e.g. the Hagood Mill series) rather than guessing narrow.
  const ordinalInText = findOrdinalWeekday(text);
  if (ordinalInText && /\bmonthly\b/i.test(text)) {
    const explicitRange = findExplicitMonthRange(text);
    const seasonWord = findSeasonWindow(text);
    const season = explicitRange ?? (seasonWord ? { start: seasonWord.start, end: seasonWord.end } : { start: 1, end: 12 });
    return {
      rule: { frequency: "monthly", weekday: ordinalInText.weekday, ordinal: ordinalInText.ordinal, seasonStartMonth: season.start, seasonEndMonth: season.end },
      confidence: "confirmed_pattern",
      explanation: `Source date text states an ordinal-weekday monthly pattern${explicitRange || seasonWord ? " with a season window" : " (season not stated -- defaulted to year-round)"}.`,
    };
  }

  // 3. A weekly weekday pattern stated in the source text ("Friday nights",
  //    "every Thursday"), with the season window resolved from whichever
  //    text states it. If the source only vaguely says "in season" with no
  //    explicit range, and the name supplies a season word, the frequency
  //    and weekday are still source-confirmed but the season boundary is a
  //    guess -- so the whole rule is marked estimated rather than
  //    overclaiming confidence on the part we didn't actually confirm.
  const weekdayInText = findBareWeekday(text);
  if (weekdayInText && (/\bweekly\b/i.test(text) || /\bnights?\b/i.test(text) || /\bevenings?\b/i.test(text) || /\bevery\b/i.test(text))) {
    const explicitRange = findExplicitMonthRange(text);
    const seasonInText = findSeasonWindow(text);
    const seasonInName = findSeasonWindow(eventName);
    const season = explicitRange ?? seasonInText ?? seasonInName;
    if (season) {
      const sourceStatedSeason = !!(explicitRange || seasonInText);
      return {
        rule: { frequency: "weekly", weekday: weekdayInText.weekday, seasonStartMonth: season.start, seasonEndMonth: season.end },
        confidence: sourceStatedSeason ? "confirmed_pattern" : "estimated",
        explanation: sourceStatedSeason
          ? "Source date text states a weekly weekday pattern with a season window."
          : `Source date text states a weekly weekday pattern ("in season") with no explicit range; season window guessed from "${(season as { word?: string }).word ?? "the event name"}" in the event name.`,
      };
    }
    // Weekday + frequency confirmed, but no season signal anywhere --
    // still more useful than nothing: assume year-round weekly, flagged
    // estimated since the season is a pure guess.
    return {
      rule: { frequency: "weekly", weekday: weekdayInText.weekday, seasonStartMonth: 1, seasonEndMonth: 12 },
      confidence: "estimated",
      explanation: "Source date text states a weekly weekday pattern with no season given anywhere -- defaulted to year-round.",
    };
  }

  // 4. A single bare month named in the SOURCE text itself (e.g. "Mid-May",
  //    with no day and no weekday) -- more specific than anything the name
  //    alone could tell us, so this outranks every name-only cue below even
  //    though it's still just a month, not a day.
  const monthInText = findBareMonthInText(text);
  if (monthInText) {
    return {
      rule: { frequency: "annual-date", month: monthInText.month, day: 1 },
      confidence: "estimated",
      explanation: "Source date text names a month with no specific day (e.g. \"Mid-May\") -- anchored to the 1st as a placeholder pending Refresh confirmation of the actual date.",
    };
  }

  // 5. Nothing patterned or month-specific in the source text at all --
  //    fall back to the event's own name as a last resort before giving
  //    up. Everything here is estimated: the name is us reading a cue, not
  //    the source stating a recurrence.
  const ordinalInName = findOrdinalWeekday(eventName);
  if (ordinalInName) {
    return {
      rule: { frequency: "monthly", weekday: ordinalInName.weekday, ordinal: ordinalInName.ordinal, seasonStartMonth: 1, seasonEndMonth: 12 },
      confidence: "estimated",
      explanation: "Ordinal-weekday pattern embedded in the event name itself (e.g. \"Third Saturday\"), season not stated anywhere -- defaulted to year-round.",
    };
  }

  for (const { pattern, month, day, label } of HOLIDAY_DATES) {
    if (pattern.test(eventName) || pattern.test(text)) {
      return {
        rule: { frequency: "annual-date", month, day },
        confidence: "estimated",
        explanation: `Inferred from "${label}" in the event name -- source did not give a specific future date (do not treat as confirmed).`,
      };
    }
  }

  for (const { pattern, month, label } of HOLIDAY_MONTH_ONLY) {
    if (pattern.test(eventName) || pattern.test(text)) {
      return {
        rule: { frequency: "annual-date", month, day: 1 },
        confidence: "estimated",
        explanation: `"${label}" names a month, not a specific day (a themed event like this is rarely held on the holiday's own date) -- anchored to the 1st of that month as a placeholder pending Refresh confirmation.`,
      };
    }
  }

  const monthInName = findBareMonthInName(eventName);
  if (monthInName) {
    return {
      rule: { frequency: "annual-date", month: monthInName.month, day: 1 },
      confidence: "estimated",
      explanation: `Month named in the event's own title -- anchored to the 1st as a placeholder pending Refresh confirmation of the actual date.`,
    };
  }

  const seasonInName = findSeasonWindow(eventName);
  if (seasonInName) {
    return {
      rule: { frequency: "annual-date", month: seasonInName.start, day: 1 },
      confidence: "estimated",
      explanation: `Season named in the event's own title ("${seasonInName.word}") with no other date signal -- anchored to the 1st of the season's first month as a placeholder pending Refresh confirmation.`,
    };
  }

  return null;
}
