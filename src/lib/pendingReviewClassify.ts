// Split out of pendingReview.ts: that file is a "use server" Server
// Actions module, and Next.js requires every export from one of those to
// itself be an async server action -- a plain sync pure function (this
// one) isn't allowed to live there, even as an internal helper. Types and
// the classification logic live here instead; pendingReview.ts imports
// them.
export type PendingEventSnapshot = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  archived: boolean;
  pending_hard_delete: boolean;
  pending_state_review: boolean;
};

export type ApproveOutcome =
  | { outcome: "approved"; event: PendingEventSnapshot }
  | { outcome: "already_approved"; event: PendingEventSnapshot }
  | { outcome: "archived"; event: PendingEventSnapshot }
  | { outcome: "pending_hard_delete"; event: PendingEventSnapshot }
  | { outcome: "not_found" }
  | { outcome: "invalid_id" }
  | { outcome: "error"; error: string };

// Classifies a zero-rows-affected re-read. Pure and exported so it can be
// unit-tested without a database (pendingReview.classify.test.ts) -- but
// this is ONLY the classification of an already-fetched row. It proves
// nothing about authorization, RLS, the real conditional UPDATE, or
// concurrent requests; those are covered (or named as a gap) separately,
// per Greg's explicit correction that pure-function fixtures can't
// establish that on their own.
export function classifyStaleRow(row: PendingEventSnapshot | null): ApproveOutcome {
  if (!row) return { outcome: "not_found" };
  if (row.archived) return { outcome: "archived", event: row };
  if (row.pending_hard_delete) return { outcome: "pending_hard_delete", event: row };
  // Covers both "already false when we got here" and the rarer case where
  // a concurrent request flipped it and this re-read just confirms that --
  // behaviorally identical from this request's point of view: nothing for
  // *this* request to approve, and no new receipt to show for it.
  return { outcome: "already_approved", event: row };
}
