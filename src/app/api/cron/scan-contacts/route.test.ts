// Pure-function coverage only, same scope note as gmailScan.test.ts /
// pendingReviewClassify.test.ts: proves matchByNameMention's own matching
// logic is right given the text and records it's handed. Does not cover
// the rest of the route (auth, the Gmail scan, the Supabase writes).
//
// Written alongside the 2026-11-23 "longest match wins" fix. Root cause,
// confirmed against the live candidates table before this fix: a bulk
// import had left an event row named just "Festival" (8 chars, clears
// the length floor), which matched nearly every outbound pitch -- every
// one has the word "Festival" in its subject -- before the old
// first-match loop ever reached the genuinely correct, more specific
// name sitting in the SAME text. ~10 candidates ended up pointing at
// whatever that placeholder record happened to be named/renamed to over
// time, including "Baldwin Strawberry Festival" once that one got
// renamed from the placeholder.
import { describe, expect, it } from "vitest";
import { matchByNameMention } from "./route";

type Record_ = { id: string; name: string };

function records(...names: string[]): Record_[] {
  return names.map((name, i) => ({ id: String(i), name }));
}

describe("matchByNameMention", () => {
  it("returns null for empty text", () => {
    expect(matchByNameMention("", records("Festival"))).toBeNull();
  });

  it("returns null when nothing matches", () => {
    expect(matchByNameMention("Just checking in on the invoice.", records("Festival"))).toBeNull();
  });

  it("skips a record name under 4 characters", () => {
    expect(matchByNameMention("Come see the Fab show!", records("Fab"))).toBeNull();
  });

  it("matches case-insensitively", () => {
    const [festival] = records("Festival");
    expect(matchByNameMention("curious about your FESTIVAL plans", [festival])).toEqual(festival);
  });

  it("prefers the longest matching name over the first one in array order", () => {
    // The actual bug: with "Festival" listed first, the old code returned
    // it immediately and never checked "Rose Show & Festival" at all.
    const [generic, specific] = records("Festival", "Rose Show & Festival");
    const text =
      "Hi Rose Show & Festival Team,\n\nCurious if you've started planning entertainment for the 2027 Rose Show & Festival.";
    expect(matchByNameMention(text, [generic, specific])).toEqual(specific);
  });

  it("gives the same answer regardless of which order the records are in", () => {
    const [generic, specific] = records("Festival", "Winter Garden Music Festival");
    const text = "Hi Winter Garden Music Fest Team,\n\n...the 2027 Winter Garden Music Festival.";
    expect(matchByNameMention(text, [generic, specific])).toEqual(specific);
    expect(matchByNameMention(text, [specific, generic])).toEqual(specific);
  });

  it("still returns the only match when just one record's name appears", () => {
    const [onlyMatch] = records("Pepper Jelly Festival");
    const text = "Hi Pepper Jelly Festival Team,\n\nCurious if you've started planning...";
    expect(matchByNameMention(text, [onlyMatch])).toEqual(onlyMatch);
  });

  it("does not match a generic placeholder when no specific name is present either", () => {
    // A pitch to a prospect with no event record on file at all yet --
    // the generic "Festival" placeholder would still match, and that's
    // correct/expected (it's the only signal available); the fix is
    // about preferring specificity when it EXISTS, not suppressing the
    // generic match outright.
    const [generic] = records("Festival");
    const text = "Hi Flowertown Festival Team,\n\nCurious if you've started planning...";
    expect(matchByNameMention(text, [generic])).toEqual(generic);
  });
});
