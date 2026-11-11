"use server";

import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import {
  classifyStaleRow,
  type ApproveOutcome,
  type PendingEventSnapshot,
} from "@/lib/pendingReviewClassify";

// Admin Pending Review v1 (2026-11-11, per Greg). A per-record "Approve for
// outreach" action that clears events.pending_state_review for exactly one
// event at a time. Deliberately small: no bulk/state-wide approval, no
// Google Sheets audit append, no email-alert fallback -- Greg's explicit
// v1 scope cut. The on-screen confirmation this returns is a one-time
// receipt, not a saved audit record; nothing here writes permanent
// approval history anywhere.
//
// Types and the stale-row classifier live in lib/pendingReviewClassify.ts,
// not here -- every export from a "use server" file must itself be an
// async server action, which a plain sync classifier can't be.

export type { ApproveOutcome, PendingEventSnapshot };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SNAPSHOT_COLUMNS =
  "id, name, city, state, archived, pending_hard_delete, pending_state_review";

export async function approveForOutreach(eventId: string): Promise<ApproveOutcome> {
  // Admin gate first, before any read or write. The existing dedup action
  // on this same table relies on RLS being open rather than checking this
  // itself -- per Greg, that doesn't prove this action is admin-only, so
  // this calls requireAdmin() directly rather than trusting the page-level
  // gate or RLS. See pendingReview.server.test.ts for the mocked-dependency
  // test that a non-admin caller never reaches the database at all.
  await requireAdmin();

  if (!UUID_RE.test(eventId)) {
    return { outcome: "invalid_id" };
  }

  const supabase = await createClient();

  // The one exact-ID conditional UPDATE this feature performs. This -- not
  // the re-read below -- is what makes it safe against two simultaneous
  // "Approve" clicks for the same event: both run this statement, but only
  // whichever commits first still matches pending_state_review=true, so
  // the second affects zero rows and falls through to classification
  // rather than a second "approved" receipt. Only pending_state_review is
  // in the SET payload, so no other column can be touched by this
  // statement; verified against a disposable, non-production Postgres
  // fixture (not this project), not assumed from "no trigger exists."
  const { data: updated, error: updateError } = await supabase
    .from("events")
    .update({ pending_state_review: false })
    .eq("id", eventId)
    .eq("pending_state_review", true)
    .eq("archived", false)
    .eq("pending_hard_delete", false)
    .select(SNAPSHOT_COLUMNS);

  if (updateError) {
    // A database error is never reported as success.
    return { outcome: "error", error: updateError.message };
  }

  if (updated && updated.length === 1) {
    return { outcome: "approved", event: updated[0] as unknown as PendingEventSnapshot };
  }

  if (updated && updated.length > 1) {
    // Can't happen against a primary-key match; if it ever did, don't
    // report a clean single-record approval over something this wrong.
    return {
      outcome: "error",
      error: `Update matched ${updated.length} rows for a single event id -- stopped without approving anything.`,
    };
  }

  // Zero rows changed. Re-read purely to explain why to the operator --
  // not to protect against a race, which the conditional UPDATE above
  // already did. Never turn this re-read into a claimed approval.
  const { data: current, error: readError } = await supabase
    .from("events")
    .select(SNAPSHOT_COLUMNS)
    .eq("id", eventId)
    .maybeSingle();

  if (readError) {
    return { outcome: "error", error: readError.message };
  }

  return classifyStaleRow((current as unknown as PendingEventSnapshot | null) ?? null);
}
