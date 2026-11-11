// Pure-function coverage only. Per Greg's correction: this proves
// classifyStaleRow's own branching is right given a row it's handed --
// nothing more. It does NOT and cannot establish authorization, RLS, the
// real conditional-update/affected-row semantics, or concurrent-request
// behavior; those are covered in pendingReview.server.test.ts (mocked
// dependencies) and, for the actual race, a one-off disposable-Postgres
// check reported alongside this feature rather than checked in here (see
// the feature's commit message / handoff notes for why not: it needs
// Docker, which a normal `npm test` run shouldn't depend on).
import { describe, expect, it } from "vitest";
import { classifyStaleRow, type PendingEventSnapshot } from "@/lib/pendingReviewClassify";

function row(overrides: Partial<PendingEventSnapshot> = {}): PendingEventSnapshot {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    name: "Test Event",
    city: "Tempe",
    state: "AZ",
    archived: false,
    pending_hard_delete: false,
    pending_state_review: true,
    ...overrides,
  };
}

describe("classifyStaleRow", () => {
  it("classifies a missing row as not_found", () => {
    expect(classifyStaleRow(null)).toEqual({ outcome: "not_found" });
  });

  it("classifies an archived row as archived, even if pending_state_review is still true", () => {
    const r = row({ archived: true, pending_state_review: true });
    expect(classifyStaleRow(r)).toEqual({ outcome: "archived", event: r });
  });

  it("classifies a pending_hard_delete row as pending_hard_delete, not archived", () => {
    const r = row({ pending_hard_delete: true });
    expect(classifyStaleRow(r)).toEqual({ outcome: "pending_hard_delete", event: r });
  });

  it("prefers archived over pending_hard_delete when both are true", () => {
    const r = row({ archived: true, pending_hard_delete: true });
    expect(classifyStaleRow(r).outcome).toBe("archived");
  });

  it("classifies a non-archived, non-hard-delete row with pending_state_review already false as already_approved", () => {
    const r = row({ pending_state_review: false });
    expect(classifyStaleRow(r)).toEqual({ outcome: "already_approved", event: r });
  });

  it("falls back to already_approved for the (shouldn't-happen) case of a row that still looks approvable", () => {
    // All three guard columns look fine, yet the caller got zero rows
    // affected from its UPDATE and is re-reading to find out why -- e.g. a
    // concurrent request flipped it back between the UPDATE and this
    // re-read. There is no dedicated label for this in the UI; it must not
    // silently fall through to "approved".
    const r = row();
    expect(classifyStaleRow(r).outcome).toBe("already_approved");
  });
});
