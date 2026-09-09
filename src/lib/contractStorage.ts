const CONTRACT_BUCKET = "play-contracts";

// Structural rather than importing a concrete Supabase client type -- kept
// this way even though the only caller today (the Contract Review screen's
// authenticated staff actions) uses the normal server client, because the
// signature webhook route (see api/webhooks/signwell/route.ts) needs a
// service-role client for its own, unrelated storage write and it's cheap
// insurance against this signature drifting if a second caller ever needs
// a different client again.
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
// Used by the Contract Review screen's regenerate/send actions (see
// app/actions/contractReview.ts) -- the only place a *pre-signature*
// generated .docx gets saved. The signature webhook route stores the
// final *signed* PDF separately (see saveSignedContractToPlay below);
// the two are deliberately not the same file or the same code path.
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

// Stores the final, tamper-evident signed PDF once a signature request
// completes. Deliberately under a `signed/` top-level prefix rather than
// nested inside `${playId}/` -- saveContractToPlay above lists and prunes
// everything directly under `${playId}/` on every regenerate, and a signed
// PDF sitting in that same folder would either get swept up as "stale" or
// silently confuse that pruning logic. Returns the storage path; the caller
// (the signature webhook route) is responsible for recording it on
// contract_signatures.signed_document_path -- this function only touches
// storage, not the database, since it doesn't know the signature row's id.
export async function saveSignedContractToPlay(
  client: Pick<StorageCapableClient, "storage">,
  playId: string,
  base64: string
): Promise<string> {
  const path = `signed/${playId}/${Date.now()}-signed.pdf`;
  const bytes = Buffer.from(base64, "base64");
  const { error } = await client.storage.from(CONTRACT_BUCKET).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw new Error(error.message);
  return path;
}
