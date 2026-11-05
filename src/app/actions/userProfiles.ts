"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Per-account display names (2026-11-05, per Greg -- a third Base Camp user
// is joining soon, and the first two already have real logins:
// gburroughs@theridgemusicgroup.com, jmayotte@theridgemusicgroup.com).
// `user_profiles` (see the add_user_profiles migration) holds one optional
// row per auth.users id. No row, or a null/blank display_name, falls back
// to the account's email everywhere a Base Camp user gets attributed (e.g.
// outreach "pitched by" -- see docs/outreach-engine-plan.md).
//
// Listing every account requires the Admin API (`auth.admin.listUsers`),
// which only works with the service-role key -- the normal session client
// (lib/supabase/server.ts) has no access to other users' auth.users rows,
// by design. This is the one other legitimate service-role use in the
// project alongside the SignWell webhook (see serviceRole.ts's comment);
// it's read-only here (just resolving email addresses to show them), so it
// doesn't carry the same risk as a service-role *write* path would.
// Writing a display name itself goes through the normal session client
// below, same as every other authenticated write in the app.

export type TeamMember = {
  id: string;
  email: string;
  /** Raw stored value -- null if this account has never set one. Resolve
   * the fallback-to-email display logic at the call site (see
   * lib/displayName.ts's resolveDisplayName) rather than baking it in
   * here, so a caller that needs to know "has this person actually set a
   * name" still can. */
  displayName: string | null;
};

export async function listTeamMembers(): Promise<TeamMember[]> {
  const admin = createServiceRoleClient();

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) {
    throw new Error(`Couldn't list Base Camp accounts: ${usersError.message}`);
  }

  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("id, display_name");
  if (profilesError) {
    throw new Error(`Couldn't read display names: ${profilesError.message}`);
  }

  const nameById = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]));

  return usersData.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "(no email on file)",
      displayName: nameById.get(u.id) ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function updateDisplayName(
  userId: string,
  displayName: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = displayName.trim();
  const supabase = await createClient();
  const { error } = await supabase
    .from("user_profiles")
    .upsert(
      { id: userId, display_name: trimmed === "" ? null : trimmed, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}
