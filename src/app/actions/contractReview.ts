"use server";

import { createClient } from "@/lib/supabase/server";
import { saveContractToPlay } from "@/lib/contractStorage";
import { generateContractForPlay } from "./contract";

type ActionResult = { ok: true } | { ok: false; error: string };

// Regenerates from current data and saves onto the play's Contract File
// slot. The only way anything on a generated contract gets fixed is by
// correcting the underlying field and regenerating -- there's no document
// editor -- so this is what both actions below do before anything else,
// guaranteeing the saved file always reflects the latest edit rather than
// whatever was on file at approval time.
//
// Runs as the logged-in staff member (normal client, not the admin one
// the approval flow's auto-save needs) -- this is triggered from inside
// Base Camp by an authenticated agent, and play-contracts' storage
// policies already allow authenticated reads/writes.
async function regenerateAndSave(playId: string): Promise<ActionResult> {
  const contract = await generateContractForPlay(playId);
  if (!contract.ok) return { ok: false, error: contract.error };

  const supabase = await createClient();
  try {
    await saveContractToPlay(supabase, playId, contract.fileName, contract.base64);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Couldn't save the contract file.",
    };
  }
  return { ok: true };
}

// Used on the Contract Review screen any time -- before anything's been
// generated yet, or after fixing a field -- to refresh the saved copy
// without also marking it sent.
export async function regenerateContract(playId: string): Promise<ActionResult> {
  return regenerateAndSave(playId);
}

// The agent's confirmation that they've reviewed the contract and it's
// going out to the buyer. Regenerates one more time first (see
// regenerateAndSave) so a last-second correction is never silently left
// out of what actually gets sent, then marks the document's own
// send-lifecycle field -- separate from plays.status, which already
// flipped to contract_sent back when management approved.
export async function sendContractToBuyer(playId: string): Promise<ActionResult> {
  const saved = await regenerateAndSave(playId);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const { error } = await supabase
    .from("plays")
    .update({ contract_sent_to_buyer_at: new Date().toISOString() })
    .eq("id", playId);
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

// Undo for a misclick -- clears the sent marker without touching the saved
// file, so the play goes back to showing the review screen's "ready to
// send" state.
export async function unmarkContractSentToBuyer(playId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("plays")
    .update({ contract_sent_to_buyer_at: null })
    .eq("id", playId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
