const CONTRACT_BUCKET = "play-contracts";

// Structural rather than importing a concrete Supabase client type -- this
// runs against two different clients depending on caller (the service-role
// admin client from the public approval flow, and the normal authenticated
// staff client from the Contract Review screen), and both expose this same
// surface at runtime even though their generated types don't line up
// exactly. Only the methods actually used here are declared.
type StorageCapableClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        body: Buffer,
        opts: { contentType: string; upsert: boolean }
      ) => PromiseLike<{ error: { message: string } | null }>;
      list: (prefix: string) => PromiseLike<{ data: { name: string }[] | null }>;
      remove: (paths: string[]) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

// Saves a generated contract into the play's own Contract File slot --
// same bucket and columns ContractUpload.tsx uses for a manually uploaded
// contract, so a generated copy shows up there exactly as if someone had
// uploaded it by hand. Keeps exactly one file on record per play: whatever
// was there before (manual upload, or an earlier generation) is removed
// once the new copy is safely uploaded, rather than letting copies pile up.
//
// Shared by both places that write here: the approval flow (public,
// anon-role context -- needs the service-role admin client, since
// play-contracts' storage policies are authenticated-only) and the
// Contract Review screen's "Send to buyer" action (authenticated staff
// context -- the normal client already has the access it needs). Neither
// caller should duplicate this sequence; see app/actions/approval.ts and
// app/actions/contractReview.ts.
export async function saveContractToPlay(
  client: StorageCapableClient,
  playId: string,
  fileName: string,
  base64: string
): Promise<void> {
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${playId}/${Date.now()}-${safeName}`;
  const bytes = Buffer.from(base64, "base64");

  const { error: uploadError } = await client.storage.from(CONTRACT_BUCKET).upload(path, bytes, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    upsert: true,
  });
  if (uploadError) throw new Error(uploadError.message);

  const { data: existing } = await client.storage.from(CONTRACT_BUCKET).list(playId);
  const stale = (existing ?? [])
    .map((f) => `${playId}/${f.name}`)
    .filter((p) => p !== path);
  if (stale.length > 0) {
    await client.storage.from(CONTRACT_BUCKET).remove(stale);
  }

  const { error: updateError } = await client
    .from("plays")
    .update({
      contract_file_path: path,
      contract_file_name: fileName,
      contract_uploaded_at: new Date().toISOString(),
    })
    .eq("id", playId);
  if (updateError) throw new Error(updateError.message);
}
