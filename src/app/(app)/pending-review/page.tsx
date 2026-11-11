import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import PendingReviewList, { type PendingReviewRow } from "@/components/PendingReviewList";

export default async function PendingReviewPage() {
  // Admin-only (same gate as Candidates/Revenue/Team) -- see src/lib/admin.ts.
  await requireAdmin();
  const supabase = await createClient();

  // Same pending set the Events page's visibility filter already excludes
  // (archived=false AND pending_state_review=true), narrowed further to
  // pending_hard_delete=false -- an event already marked for hard delete
  // has no business being offered "Approve for outreach" here.
  const { data } = await supabase
    .from("events")
    .select("id, name, city, state, archived, pending_hard_delete, pending_state_review")
    .eq("archived", false)
    .eq("pending_hard_delete", false)
    .eq("pending_state_review", true)
    .order("name");

  const rows: PendingReviewRow[] = (data ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    city: e.city as string | null,
    state: e.state as string | null,
  }));

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Pending Review</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {rows.length} event{rows.length === 1 ? "" : "s"} waiting on Pending Review being cleared.
        Approving one here only removes that one visibility gate -- Needs Date, dedup, refresh,
        genre/fit, and outreach eligibility all still apply exactly as before. This page does not
        keep a saved history of past approvals.
      </p>

      <PendingReviewList rows={rows} />
    </div>
  );
}
