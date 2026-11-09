import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// The admin-only gate (2026-11-09, per Greg: "truly treat that as a
// second, higher-level permission set" -- hide the whole Admin nav section
// and its four pages/routes from everyone except him and Justin Mayotte,
// not just the Team page). `user_profiles.is_admin` is the source of
// truth (see the add_user_admin_and_invite_tracking migration, logged in
// docs/db-schema-tracking-gaps.md since it's still pending -- nothing here
// works until that migration actually lands).
//
// Two layers, both backed by this same check, because hiding a Nav.tsx
// link doesn't stop someone from typing the URL directly:
//   - requireAdmin() below, called at the top of every admin page
//     (candidates, revenue, settings/quickbooks, settings/team) and every
//     admin-only server action (invite/deactivate/remove/promote in
//     userProfiles.ts) -- redirects a non-admin straight to the dashboard,
//     silently, per Greg's explicit choice (no "not authorized" message).
//   - isCurrentUserAdmin() below, called once from the (app) layout so
//     Nav.tsx knows whether to render the Admin section at all.
//
// Reads through the service-role client rather than the normal session
// client: user_profiles' RLS is wide-open ("authenticated_full_access"),
// so a normal client read would technically work too, but every other
// admin-sensitive read/write in this file's callers already has to use
// the service-role client (the guard trigger only allows service-role
// writes to is_admin/invite_status/etc.) -- using it here too means the
// admin check and the admin writes are reading from the exact same place,
// not two paths that could theoretically disagree.
async function currentUserIsAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const serviceRole = createServiceRoleClient();
  const { data } = await serviceRole
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  return data?.is_admin === true;
}

/** For (app)/layout.tsx -- never redirects, just answers the question so
 * Nav.tsx can decide whether to render the Admin section. */
export async function isCurrentUserAdmin(): Promise<boolean> {
  return currentUserIsAdmin();
}

export type AdminUser = { id: string; email: string };

/** Call at the top of every admin-only page and every admin-only server
 * action. Not an admin (or not logged in at all) -> redirected to "/"
 * with no explanation, per Greg's choice. Returns the calling admin's own
 * id/email for callers that need it (e.g. stamping invited_by, or
 * refusing to let an admin deactivate/remove themselves). */
export async function requireAdmin(): Promise<AdminUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  const serviceRole = createServiceRoleClient();
  const { data } = await serviceRole
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (data?.is_admin !== true) redirect("/");

  return { id: user.id, email: user.email ?? "" };
}
