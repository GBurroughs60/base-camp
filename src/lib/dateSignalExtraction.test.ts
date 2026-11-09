// No test runner existed anywhere in this repo before this change --
// vitest was added specifically to cover the new/changed name cues below
// (see package.json's new "test" script). Scoped to this one module per
// Greg's ask (2026-11-02); not a general test-suite rollout.

import { describe, expect, it } from "vitest";
import { resolveDateSignal } from "./dateSignalExtraction";

describe("resolveDateSignal -- widened 'summer' season word", () => {
  it("resolves a bare 'summer' name to May-Oct, not meteorological Jun-Aug", () => {
    const result = resolveDateSignal(null, "Downtown Summer Sounds");
    expect(result).not.toBeNull();
    expect(result!.rule).toEqual({ frequency: "annual-date", month: 5, day: 1 });
    expect(result!.confidence).toBe("estimated");
    expect(result!.explanation).toContain("summer");
  });

  it("still widens 'summer' when it drives a weekly weekday pattern's season window", () => {
    // Source text states a weekly weekday with no explicit range; the
    // season word comes from the event name, same path as the pre-existing
    // "in season" branch -- the fix is a widened lookup table value, not a
    // new code path, so this exercises that the table change actually
    // reaches this branch too.
    const result = resolveDateSignal("Held every Friday night, in season.", "Riverside Summer Fridays");
    expect(result).not.toBeNull();
    expect(result!.rule).toMatchObject({ frequency: "weekly", seasonStartMonth: 5, seasonEndMonth: 10 });
  });
});

describe("resolveDateSignal -- ordinal-weekday in event name", () => {
  it("defaults to the assumed May-Oct season, not year-round", () => {
    const result = resolveDateSignal(null, "First Friday Night Concert Series");
    expect(result).not.toBeNull();
    expect(result!.rule).toEqual({ frequency: "monthly", weekday: 5, ordinal: 1, seasonStartMonth: 5, seasonEndMonth: 10 });
    expect(result!.confidence).toBe("estimated");
    expect(result!.explanation).toContain("May-October");
  });

  it("still wins over the new concert-series cue when both would otherwise apply", () => {
    // Has both an ordinal-weekday phrase AND "Concert" in the name --
    // ordinal-weekday is checked first (step 6) and must still win.
    const result = resolveDateSignal(null, "Third Saturday Concert Series");
    expect(result).not.toBeNull();
    expect(result!.rule).toMatchObject({ frequency: "monthly", weekday: 6, ordinal: 3 });
  });
});

describe("resolveDateSignal -- new community concert-series name cue", () => {
  const seriesNames = [
    "Music on Main",
    "Concerts in the Park",
    "Front Porch Concerts",
    "Music Under the Stars",
    "Riverfront Music Series",
    "The Kate Concert Series",
  ];

  for (const name of seriesNames) {
    it(`resolves "${name}" to the May 1st estimated placeholder`, () => {
      const result = resolveDateSignal(null, name);
      expect(result).not.toBeNull();
      expect(result!.rule).toEqual({ frequency: "annual-date", month: 5, day: 1 });
      expect(result!.confidence).toBe("estimated");
      expect(result!.explanation).toContain("May-October");
    });
  }

  it("does not fire when the name already states a month or season", () => {
    // "October" wins via the earlier bare-month-in-name step; this cue
    // must never override a more specific cue that already fired.
    expect(resolveDateSignal(null, "October Music Series")?.rule).toEqual({
      frequency: "annual-date",
      month: 10,
      day: 1,
    });
  });

  it("leaves notes/text-based resolution untouched when the source text itself resolves", () => {
    // Source text names an explicit date -- must win outright over the
    // name-only series cue, same as every other text-vs-name precedence
    // rule in this module.
    const result = resolveDateSignal("Confirmed for October 17, 2026.", "Music on Main");
    expect(result?.confidence).toBe("confirmed_date");
  });
});

describe("resolveDateSignal -- concert-series cue exclusions", () => {
  it("excludes venue-programming 'Live Music at <venue>' phrasing", () => {
    expect(resolveDateSignal(null, "Live Music at 2nd Home Lounge")).toBeNull();
  });

  it("excludes 'Live Concerts'/'Live Performances' venue-programming phrasing", () => {
    expect(resolveDateSignal(null, "Infinity Music Hall Live Concerts")).toBeNull();
    expect(resolveDateSignal(null, "Live Performances at Blue Ocean Music Hall")).toBeNull();
  });

  it("excludes private/one-off life-event names even when they mention music", () => {
    expect(resolveDateSignal(null, "Smith Family Wedding Reception with Live Music")).toBeNull();
  });

  it("excludes one-off 'Festival'-named events", () => {
    expect(resolveDateSignal(null, "Hammonton Arts and Music Festival")).toBeNull();
  });

  it("excludes award shows and charity/benefit concerts", () => {
    expect(resolveDateSignal(null, "Carolina Country Music Award")).toBeNull();
    expect(resolveDateSignal(null, "Lake Wylie Children's Charity Concert")).toBeNull();
  });
});

describe("resolveDateSignal -- placeholder flag (2026-11-09)", () => {
  // Marks exactly the three bare last-resort name cues that invent an
  // arbitrary day-1 anchor from nothing more than a month/season word, or
  // just "concert"/"music", in the title -- see scripts/resolve-date-signal.ts
  // for why this matters (it's weaker evidence than a real confirmed past
  // date, so that script prefers knownDate over a placeholder result).
  it("is true for the bare month-in-name cue", () => {
    expect(resolveDateSignal(null, "October Music Series")?.placeholder).toBe(true);
  });

  it("is true for the bare season-in-name cue", () => {
    expect(resolveDateSignal(null, "Plaza Summer Concert Series")?.placeholder).toBe(true);
  });

  it("is true for the community concert-series catch-all", () => {
    expect(resolveDateSignal(null, "Music on Main")?.placeholder).toBe(true);
  });

  it("is NOT true for the ordinal-weekday-in-name cue (an actually stated pattern)", () => {
    expect(resolveDateSignal(null, "First Friday Night Concert Series")?.placeholder).toBeFalsy();
  });

  it("is NOT true for a named holiday in the name", () => {
    expect(resolveDateSignal(null, "Downtown Halloween Bash")?.placeholder).toBeFalsy();
  });

  it("is NOT true for a text-based resolution", () => {
    expect(resolveDateSignal("Confirmed for October 17, 2026.", "Music on Main")?.placeholder).toBeFalsy();
  });
});

describe("resolveDateSignal -- deliberately not given a bespoke rule", () => {
  it("'3rd on Third' stays unresolved (no weekday word, no bespoke pattern) -- hand-resolve list", () => {
    // Greg's explicit call (2026-11-02): no new rule for this shape, it
    // goes on the Phase 3c review list for hand resolution instead.
    expect(resolveDateSignal(null, "3rd on Third")).toBeNull();
  });
});
