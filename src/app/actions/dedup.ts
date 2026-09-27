"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult = { ok: true } | { ok: false; error: string };

export type DedupTable = "companies" | "events";

// "Not a duplicate" -- same shape as dismissCandidate in candidates.ts:
// the row stays exactly as-is (still archived/unarchived, still whatever
// state it was in), it just drops off the "Needs Dedup Check" pill for
// good. Also clears dedup_match_id/similarity and strips the discovery
// breadcrumb from notes, since both would otherwise keep pointing at a
// match a human already looked at and rejected.
export async function dismissDedupFlag(
  table: DedupTable,
  id: string
): Promise<ActionResult> {
  const supabase = await createClient();

  const { data: row, error: readError } = await supabase
    .from(table)
    .select("notes")
    .eq("id", id)
    .single();
  if (readError) return { ok: false, error: readError.message };

  // Strips the auto-generated "Auto-created during <state> discovery on
  // <date>. Closest existing ... — below the auto-link threshold ..."
  // paragraph discovery appends, leaving any real editorial notes above
  // it untouched. Falls back to clearing the whole field when the
  // breadcrumb was the only thing there.
  const cleanedNotes =
    (row?.notes as string | null)
      ?.replace(/\n*Auto-created during [\s\S]*? discovery on [\s\S]*$/, "")
      .trim() || null;

  const { error } = await supabase
    .from(table)
    .update({
      dedup_uncertain: false,
      dedup_match_id: null,
      dedup_match_similarity: null,
      notes: cleanedNotes,
    })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Merges a flagged record into the one it was matched against, via the
// merge_company_records/merge_event_records DB functions (see migration
// dedup_geo_guard_and_merge): every foreign key pointing at `id` gets
// repointed at `targetId`, then `id` is archived, same soft-delete
// convention as everywhere else in this schema -- nothing is hard-deleted,
// so a bad merge is still recoverable by hand.
export async function mergeDedupRecord(
  table: DedupTable,
  id: string,
  targetId: string
): Promise<ActionResult> {
  const supabase = await createClient();
  const rpcName =
    table === "companies" ? "merge_company_records" : "merge_event_records";
  const { error } = await supabase.rpc(rpcName, {
    p_duplicate_id: id,
    p_target_id: targetId,
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
