import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// A deliberately short, named list of legitimate service-role uses in this
// project -- everything else should go through the normal session client
// in lib/supabase/server.ts. Each one needs *this* client specifically,
// not just prefers it:
//   - The SignWell signature webhook: an unauthenticated server-to-server
//     callback, not a Base Camp user's session, so there's no cookie-based
//     session for the normal client to use, and contract_signatures' RLS
//     (authenticated-only, like everything else) would otherwise block it
//     entirely. (This was deliberately removed from everywhere else in the
//     app earlier -- see the "Simplify approval-response notification"
//     change -- once the Contract Review screen made an admin client
//     unnecessary for every *authenticated-session* write.)
//   - Settings > Team's account listing (userProfiles.ts) and the whole
//     admin/invite feature (src/lib/admin.ts, and every
//     invite/deactivate/remove/promote action in userProfiles.ts): listing
//     every Base Camp account, or creating/banning/deleting one, needs
//     Supabase's Admin API (auth.admin.*), which only the service-role key
//     can call. Separately, user_profiles.is_admin/invite_status/
//     invited_at/invited_by are guarded by a DB trigger that only allows
//     service-role writes (see the add_user_admin_and_invite_tracking
//     migration) -- this is the one client that trigger lets through.
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
