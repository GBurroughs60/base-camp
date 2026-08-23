"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const BUCKET = "play-contracts";

export default function ContractUpload({
  playId,
  filePath,
  fileName,
  uploadedAt,
}: {
  playId: string;
  filePath: string | null;
  fileName: string | null;
  uploadedAt: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState(filePath);
  const [name, setName] = useState(fileName);
  const [uploaded, setUploaded] = useState(uploadedAt);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const newPath = `${playId}/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(newPath, file, { upsert: true });
      if (uploadError) throw uploadError;

      // remove the old file if one existed, now that the new one is in place
      if (path) {
        await supabase.storage.from(BUCKET).remove([path]);
      }

      const nowIso = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("plays")
        .update({
          contract_file_path: newPath,
          contract_file_name: file.name,
          contract_uploaded_at: nowIso,
        })
        .eq("id", playId);
      if (updateError) throw updateError;

      setPath(newPath);
      setName(file.name);
      setUploaded(nowIso);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleView() {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(path, 60);
      if (signError) throw signError;
      if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't open the file.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove() {
    if (!path) return;
    setBusy(true);
    setError(null);
    try {
      await supabase.storage.from(BUCKET).remove([path]);
      const { error: updateError } = await supabase
        .from("plays")
        .update({
          contract_file_path: null,
          contract_file_name: null,
          contract_uploaded_at: null,
        })
        .eq("id", playId);
      if (updateError) throw updateError;
      setPath(null);
      setName(null);
      setUploaded(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't remove the file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="text-sm">
      {path ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleView}
              disabled={busy}
              className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4 truncate text-left disabled:opacity-50"
            >
              {name ?? "Contract"}
            </button>
          </div>
          {uploaded && (
            <p className="text-black/50 dark:text-white/50 text-xs">
              Uploaded {new Date(uploaded).toLocaleDateString("en-US")}
            </p>
          )}
          <div className="flex gap-3 pt-1">
            <button
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="text-xs border border-black/15 dark:border-white/15 rounded-md px-2.5 py-1 hover:border-ridge-orange/50 disabled:opacity-50"
            >
              Replace
            </button>
            <button
              onClick={handleRemove}
              disabled={busy}
              className="text-xs border border-black/15 dark:border-white/15 rounded-md px-2.5 py-1 hover:border-red-400 disabled:opacity-50"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="text-xs bg-ridge-orange hover:bg-ridge-orange-dark text-white rounded-md px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Upload contract"}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/*,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />

      {error && <p className="text-red-500 text-xs mt-2">{error}</p>}
    </div>
  );
}
