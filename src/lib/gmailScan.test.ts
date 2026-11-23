// Pure-function coverage only, same scope note as pendingReviewClassify's
// tests: this proves extractGreetingName/looksLikeNonPersonName/cleanName
// are right given the text they're handed. It does NOT cover the Gmail
// API integration, MIME parsing, or quote-stripping in scanMailbox --
// those would need a mocked googleapis client and aren't exercised here.
//
// Written alongside the 2026-11-23 fix for inferred_name quality (per
// Greg: candidates were getting names like "Florida"/"Infinity"/"Osceola"
// instead of a real person's name, or no name at all). Root cause,
// confirmed against the live candidates table before this fix: nearly
// every bad single-word inferred_name traced back to Ridge's own outbound
// pitch template greeting, "Hi <Event/Venue Name> Team," -- the old regex
// only required a word boundary after the captured word, so it grabbed
// the FIRST word of that address ("Florida" from "Hi Florida Keys Seafood
// Festival Team,") as though it were a person's name. A real single-name
// greeting ("Hi Kimber,") was never the problem; it already worked.
// Deliberately not a dictionary/word-list approach for the general case --
// "Stafford", "Osceola", "Infinity" are real venue names, not words a
// denylist could safely flag, and are legitimate captures when they
// really do come from a "Hi <Name>," line.
import { describe, expect, it } from "vitest";
import { cleanName, extractGreetingName, looksLikeNonPersonName } from "@/lib/gmailScan";

describe("extractGreetingName", () => {
  it("captures a real single-name greeting ending in a comma", () => {
    expect(extractGreetingName("Hi Kimber,\r\n\r\nCurious if you've started planning...")).toBe(
      "Kimber"
    );
  });

  it("captures a name on its own line with no trailing comma", () => {
    expect(extractGreetingName("Hi Sarah\nThanks for your patience on this contract.")).toBe(
      "Sarah"
    );
  });

  it("captures after 'Dear' too", () => {
    expect(extractGreetingName("Dear Sarah,\n\nReaching out about...")).toBe("Sarah");
  });

  it("does NOT capture the lead word of a multi-word org/event greeting", () => {
    // The actual bug: this used to return "Winter".
    expect(
      extractGreetingName(
        "Hi Winter Garden Music Fest Team,\r\n\r\nCurious if you've started planning entertainment..."
      )
    ).toBeNull();
  });

  it("does NOT capture other real examples seen in the candidates table", () => {
    expect(
      extractGreetingName("Hi Florida Keys Seafood Festival Team,\r\n\r\nCurious if...")
    ).toBeNull();
    expect(extractGreetingName("Hi Osceola County Fair Team,\r\n\r\nCurious if...")).toBeNull();
    expect(
      extractGreetingName("Hi Stafford Palace Theater Team,\r\n\r\nCurious how your...")
    ).toBeNull();
  });

  it("rejects a generic salutation filler even though it's comma-terminated", () => {
    expect(extractGreetingName("Hi Team,\n\nJust checking in.")).toBeNull();
    expect(extractGreetingName("Hi There,\n\nFollowing up on...")).toBeNull();
    expect(extractGreetingName("Hi All,\n\nQuick update.")).toBeNull();
  });

  it("returns null when there's no greeting at all", () => {
    expect(extractGreetingName("Thanks for the intro, great to connect.")).toBeNull();
  });

  it("only looks at the first ~300 characters", () => {
    const padding = "x".repeat(400);
    expect(extractGreetingName(`${padding}\nHi Mark,\n\nSee above.`)).toBeNull();
  });
});

describe("looksLikeNonPersonName", () => {
  it("flags an email address used as a display name", () => {
    expect(looksLikeNonPersonName("jesse@212social.co")).toBe(true);
  });

  it("flags a bare domain/product name", () => {
    expect(looksLikeNonPersonName("RightSignature.com")).toBe(true);
    expect(looksLikeNonPersonName("Wix.com")).toBe(true);
  });

  it("does not flag a real name", () => {
    expect(looksLikeNonPersonName("Austin")).toBe(false);
    expect(looksLikeNonPersonName("Mary Smith")).toBe(false);
  });
});

describe("cleanName", () => {
  it("passes through a real name, trimmed", () => {
    expect(cleanName("  Austin  ")).toBe("Austin");
  });

  it("returns null for missing input", () => {
    expect(cleanName(null)).toBeNull();
    expect(cleanName(undefined)).toBeNull();
    expect(cleanName("   ")).toBeNull();
  });

  it("returns null for an email-shaped or domain-shaped display name", () => {
    expect(cleanName("jesse@212social.co")).toBeNull();
    expect(cleanName("RightSignature.com")).toBeNull();
  });
});
