import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// The one legitimate place this project needs a service-role credential --
// this was deliberately removed earlier (see the "Simplify approval-response
// notification" change) once the Contract Review screen made an admin
// client unnecessary for every *authenticated-session* write. A signature
// webhook is different in kind: it's an unauthenticated server-to-server
// callback from SignWell, not a Base Camp user's session, so there's no
// cookie-based session for the normal server client to use, and
// contract_signatures' RLS (authenticated-only, like everything else) would
// otherwise block it entirely. Use this ONLY from the webhook route --
// every other write in this app should go through the normal session
// client in lib/supabase/server.ts.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not set -- required for the signature webhook route to write outside an authenticated session."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
