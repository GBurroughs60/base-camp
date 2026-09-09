import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Service-role client for the one or two privileged server-side writes the
// public, unauthenticated approval flow needs to make (storage uploads and
// the plays-row update pointing at them) that anon-role RLS correctly
// blocks everywhere else -- see storage.objects policies on the
// play-contracts bucket (authenticated-only) and respond() in
// app/actions/approval.ts, the only caller.
//
// Import this ONLY from server-only modules ("use server" actions).
// SUPABASE_SERVICE_ROLE_KEY must never reach the client bundle -- nothing
// here is exported to, or usable from, a "use client" component.
//
// Returns null (rather than throwing) when the key isn't configured yet,
// so a missing env var degrades a nice-to-have (saving the generated
// contract onto the play) instead of breaking the approval response the
// agent is actually waiting on.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
