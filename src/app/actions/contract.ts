"use server";

import { generateContractDocx } from "@/lib/generateContract";
import { fetchContractContext, buildContractMergeData } from "@/lib/contractData";

type GenerateResult =
  | { ok: true; base64: string; fileName: string }
  | { ok: false; error: string };

// Fills the contract template for one play. The merge-data mapping itself
// lives in lib/contractData.ts, shared with the Contract Review screen
// (plays/[id]/contract) so both surfaces agree on what every field becomes
// and where its value comes from -- see fetchContractContext there for the
// full field-by-field rationale.
export async function generateContractForPlay(playId: string): Promise<GenerateResult> {
  const result = await fetchContractContext(playId);
  if (!result.ok) return { ok: false, error: result.error };

  const data = buildContractMergeData(result.context);
  const buf = await generateContractDocx(data);
  const safeArtistName = result.context.artist.name.replace(/[^a-zA-Z0-9]+/g, "_");
  const fileName = `${safeArtistName}_Performance_Agreement_${result.context.play.show_date ?? "TBD"}.docx`;

  return { ok: true, base64: buf.toString("base64"), fileName };
}
