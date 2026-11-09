// Covers resolveOne's precedence logic directly (added 2026-11-09 fixing a
// real bug: a bare name-only placeholder guess from resolveDateSignal used
// to always beat a real confirmed knownDate, because the old code only ever
// consulted knownDate when resolveDateSignal returned null outright). See
// this file's own resolveOne for the current precedence order, and
// dateSignalExtraction.ts's DateSignalResult.placeholder for which cues
// count as a bare guess.
//
// Not a general test-suite rollout for this script -- scoped to the one
// function whose logic this fix actually changed, same bar
// dateSignalExtraction.test.ts uses for its own module.

import { describe, expect, it } from "vitest";
import { resolveOne, todayUTC, type Candidate } from "./resolve-date-signal";

const TODAY = todayUTC();

describe("resolveOne -- placeholder name guess vs a real knownDate", () => {
  it("prefers knownDate's single-date-fallback over the bare concert-series catch-all", () => {
    const candidate: Candidate = {
      id: "1",
      name: "Concert for Legends",
      rawDateText: null,
      knownDate: "2025-08-16", // a Saturday
    };
    const result = resolveOne(candidate, TODAY);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.source).toBe("single-date-fallback");
      expect(result.rule).toMatchObject({ frequency: "annual", weekday: 6 });
    }
  });

  it("prefers knownDate's single-date-fallback over the bare season-in-name guess", () => {
    const candidate: Candidate = {
      id: "2",
      name: "Plaza Summer Concert Series",
      rawDateText: null,
      knownDate: "2025-07-11", // a Friday
    };
    const result = resolveOne(candidate, TODAY);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.source).toBe("single-date-fallback");
      expect(result.rule).toMatchObject({ frequency: "annual", weekday: 5, month: 7 });
    }
  });

  it("still prefers a SPECIFIC name cue (ordinal-weekday-in-name) over knownDate", () => {
    const candidate: Candidate = {
      id: "3",
      name: "First Friday Night Concert Series",
      rawDateText: null,
      knownDate: "2025-07-11",
    };
    const result = resolveOne(candidate, TODAY);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.source).toBe("pattern");
      expect(result.rule).toMatchObject({ frequency: "monthly", weekday: 5, ordinal: 1 });
    }
  });

  it("still prefers a confirmed_date from source text over knownDate", () => {
    const candidate: Candidate = {
      id: "4",
      name: "Music on Main",
      rawDateText: "Confirmed for October 17, 2026.",
      knownDate: "2025-07-11",
    };
    const result = resolveOne(candidate, TODAY);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.source).toBe("pattern");
      expect(result.confidence).toBe("confirmed_date");
    }
  });

  it("falls back to the placeholder guess when there's a placeholder but no knownDate", () => {
    const candidate: Candidate = { id: "5", name: "Music on Main", rawDateText: null, knownDate: null };
    const result = resolveOne(candidate, TODAY);
    expect(result.matched).toBe(true);
    if (result.matched) {
      expect(result.source).toBe("pattern");
      expect(result.rule).toEqual({ frequency: "annual-date", month: 5, day: 1 });
    }
  });

  it("returns unmatched when there is no signal and no knownDate at all", () => {
    const candidate: Candidate = { id: "6", name: "3rd on Third", rawDateText: null, knownDate: null };
    expect(resolveOne(candidate, TODAY).matched).toBe(false);
  });
});
