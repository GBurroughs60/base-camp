import fs from "fs";
import path from "path";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";

// The actual Word file is the source of truth for the contract's wording --
// it lives in the repo as a real .docx with {tags} typed directly into the
// text (never pasted, which is what causes docxtemplater's classic "tag
// split across XML runs" problem). Anyone on the team can open this file in
// Word and edit language directly; no code change is needed for a wording
// tweak. Only add/rename/remove a {tag} here if buildContractMergeData in
// app/actions/contract.ts is updated to match.
const TEMPLATE_PATH = path.join(
  process.cwd(),
  "src/lib/contract-template/performance-agreement-template.docx"
);

export type ContractMergeData = Record<string, string>;

// Shown in the generated contract for any field Base Camp doesn't collect
// yet (day-of schedule details like soundcheck/doors/curfew have no
// structured field on plays today) -- left visibly unresolved rather than
// silently blank or guessed, so whoever reviews the contract before it
// goes out catches it and fills it in by hand.
export const CONTRACT_TBD = "[TO BE FILLED IN BEFORE SENDING]";

export async function generateContractDocx(data: ContractMergeData): Promise<Buffer> {
  const templateBuf = fs.readFileSync(TEMPLATE_PATH);
  const zip = new PizZip(templateBuf);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    // Every tag in the template is expected to be supplied -- an unmapped
    // tag renders as an explicit, ugly error string rather than silently
    // vanishing, which is what we want: a broken merge should be obvious in
    // review, not something a human misses in a wall of legal text.
    nullGetter: (part: { value: string }) => `{{MISSING: ${part.value}}}`,
  });
  doc.render(data);
  // Explicit DEFLATE -- PizZip defaults to no compression, which would
  // otherwise balloon this ~13KB template into a 100KB+ output file.
  return doc.getZip().generate({ type: "nodebuffer", compression: "DEFLATE" });
}
