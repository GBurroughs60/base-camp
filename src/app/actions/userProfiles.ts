"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { requireAdmin } from "@/lib/admin";
import { sendInviteEmail } from "@/lib/inviteEmail";

// Per-account display names (2026-11-05, per Greg -- a third Base Camp user
// is joining soon, and the first two already have real logins:
// gburroughs@theridgemusicgroup.com, jmayotte@theridgemusicgroup.com).
// `user_profiles` (see the add_user_profiles migration) holds one optional
// row per auth.users id. No row, or a null/blank display_name, falls back
// to the account's email everywhere a Base Camp user gets attributed (e.g.
// outreach "pitched by" -- see docs/outreach-engine-plan.md).
//
// Extended 2026-11-09 (per Greg) with the admin role + the whole
// invite-a-new-user flow: is_admin/invite_status/invited_at/invited_by on
// the same table (see add_user_admin_and_invite_tracking -- still pending,
// logged in docs/db-schema-tracking-gaps.md, since the first attempt to
// apply it hit the same auto-mode production-deploy block every schema
// change in this project has hit). None of the admin-only functions below
// will work until that migration actually lands.
//
// Listing every account requires the Admin API (`auth.admin.listUsers`),
// which only works with the service-role key -- the normal session client
// (lib/supabase/server.ts) has no access to other users' auth.users rows,
// by design. This is one of the few legitimate service-role uses in the
// project (see serviceRole.ts's header comment for the full list). Writing
// a display name still goes through the normal session client below, same
// as every other authenticated write in the app -- only the admin-only
// writes (invite, resend, promote/demote, deactivate/reactivate, remove)
// need the service-role client, both for the Admin API calls themselves
// and because user_profiles' guard trigger only lets the service role
// write is_admin/invite_status/invited_at/invited_by at all.

export type TeamMemberStatus = "invited" | "started" | "active" | "deactivated";

export type TeamMember = {
  id: string;
  email: string;
  /** Raw stored value -- null if this account has never set one. Resolve
   * the fallback-to-email display logic at the call site (see
   * lib/displayName.ts's resolveDisplayName) rather than baking it in
   * here, so a caller that needs to know "has this person actually set a
   * name" still can. */
  displayName: string | null;
  isAdmin: boolean;
  /** Derived, not stored directly as one field -- see computeStatus below
   * for exactly how. "deactivated" overrides whatever invite_status says,
   * since a deactivated account that happened to be mid-invite is still
   * foremost "deactivated" from an admin's point of view. */
  status: TeamMemberStatus;
  invitedAt: string | null;
  /** This person's split of Ridge's own booking commission on a play
   * they're credited for (docs/operations-accounting-plan.md section 11)
   * -- whole-number percentage, null if never set. Never assumed to be 0
   * or 100 when null -- see the Revenue page's Agent Commissions section
   * for how a missing rate is surfaced rather than silently treated as
   * either extreme. */
  bookingCommissionSplitPct: number | null;
};

function computeStatus(
  profileInviteStatus: "invited" | "active",
  bannedUntil: string | null | undefined,
  lastSignInAt: string | null | undefined
): TeamMemberStatus {
  if (bannedUntil && new Date(bannedUntil).getTime() > Date.now()) return "deactivated";
  if (profileInviteStatus === "active") return "active";
  // invite_status === "invited": distinguish "sent, never opened" from
  // "opened the link, got a session, hasn't finished setting a password
  // yet" using the one signal auth.users actually gives us for that --
  // last_sign_in_at gets set the moment the invite/magic link is
  // consumed, before the person ever reaches our set-password step.
  return lastSignInAt ? "started" : "invited";
}

// Lightweight, non-admin-safe team listing (2026-11-10, per Greg -- a new
// non-admin team member is about to need this). Deliberately NOT
// listTeamMembers() above: that one is admin-gated (requireAdmin) and
// reads through the Admin API for email/invite-status/is_admin, all of
// which this app otherwise keeps strictly behind the Admin nav section
// (see admin.ts's header comment: "hide the whole Admin section... not
// just the Team page"). This function is for the opposite case --
// picking a teammate to credit for something (who pitched an outreach
// touch, who booked a play) from an ordinary, non-admin page. It reads
// user_profiles via the normal session client (RLS there is
// authenticated_full_access, so any logged-in user can already see every
// row) and returns only id + display_name, nothing else -- no email, no
// admin flag, no invite/active status. Every account created through the
// invite flow gets a user_profiles row immediately (see inviteTeamMember
// above), so this sees every real account from the moment they're
// invited, even before they've set a display name or signed in once;
// callers show a generic fallback for a still-null display_name (never an
// email) rather than excluding that account from the picker.
export type AttributableTeamMember = {
  id: string;
  displayName: string | null;
};

export async function listAttributableTeamMembers(): Promise<AttributableTeamMember[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select("id, display_name")
    .order("display_name");
  if (error) {
    throw new Error(`Couldn't list teammates: ${error.message}`);
  }
  return (data ?? []).map((p) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
  }));
}

export async function listTeamMembers(): Promise<TeamMember[]> {
  await requireAdmin();
  const admin = createServiceRoleClient();

  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers();
  if (usersError) {
    throw new Error(`Couldn't list Base Camp accounts: ${usersError.message}`);
  }

  const { data: profiles, error: profilesError } = await admin
    .from("user_profiles")
    .select("id, display_name, is_admin, invite_status, invited_at, booking_commission_split_pct");
  if (profilesError) {
    throw new Error(`Couldn't read account details: ${profilesError.message}`);
  }

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return usersData.users
    .map((u) => {
      const profile = profileById.get(u.id);
      const inviteStatus = (profile?.invite_status as "invited" | "active" | undefined) ?? "active";
      return {
        id: u.id,
        email: u.email ?? "(no email on file)",
        displayName: (profile?.display_name as string | null | undefined) ?? null,
        isAdmin: profile?.is_admin === true,
        status: computeStatus(inviteStatus, u.banned_until, u.last_sign_in_at),
        invitedAt: (profile?.invited_at as string | null | undefined) ?? null,
        bookingCommissionSplitPct:
          (profile?.booking_commission_split_pct as number | null | undefined) ?? null,
      };
    })
    .sort((a, b) => a.email.localeCompare(b.email));
}

// The agent's split of Ridge's own booking commission (docs/operations-
// accounting-plan.md section 11) -- e.g. 50 means the agent gets 50% of
// whatever Ridge earns on a play credited to them. Admin-only to set
// (unlike updateDisplayName, which any account can set for itself) -- this
// is compensation data, not a cosmetic preference. Same upsert reasoning
// as updateDisplayName: a user_profiles row exists for every invited
// account already (see inviteTeamMember), but this stays an upsert rather
// than a plain update for the same robustness, not because it's expected
// to hit a missing row in practice.
export async function updateBookingCommissionSplitPct(
  userId: string,
  pct: number | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (pct !== null && (pct < 0 || pct > 100)) {
    return { ok: false, error: "Enter a percentage between 0 and 100." };
  }
  const { error } = await createServiceRoleClient()
    .from("user_profiles")
    .upsert(
      { id: userId, booking_commission_split_pct: pct, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
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

// Builds the same shape of link regardless of caller (new invite vs.
// resend): our own /auth/confirm route plus Supabase's hashed_token, never
// generateLink's own action_link -- see inviteEmail.ts's header comment for
// why (Greg chose a custom Base Camp email over Supabase's built-in one,
// which means we're the one assembling this URL, not Supabase).
function buildConfirmUrl(hashedToken: string, type: "invite" | "magiclink"): string {
  // Same hardcoded-domain convention as the approve/settle links elsewhere
  // in this app (see records.ts's approveUrl) rather than a new env var --
  // there's exactly one Base Camp deployment, so there's nothing for an
  // env var to vary across yet.
  const url = new URL("/auth/confirm", "https://base-camp-lovat.vercel.app");
  url.searchParams.set("token_hash", hashedToken);
  url.searchParams.set("type", type);
  url.searchParams.set("next", "/invite/set-password");
  return url.toString();
}

// The Team page's "+ New user" form (2026-11-09, per Greg). Creates the
// auth.users row and a matching user_profiles row (invite_status:
// "invited") in the same call, then emails a one-time set-password link.
// isAdmin picks the role at invite time (per Greg's follow-up same day:
// "New users should be able to be added as users or as admins with full
// permissions on the latter") -- an admin invited this way lands straight
// at is_admin: true once they set their password, no separate "Make
// admin" click needed after the fact.
// Deliberately two separate near-identical failure returns: if the auth
// user/profile insert itself fails, nothing was created, so the admin just
// retries the whole thing. If *that* succeeds but the email send throws,
// the account now exists in a real "invited, email never delivered" state
// -- caught and returned as its own ok:false so the Team page can say so
// specifically, rather than leaving the admin to wonder whether to try
// the same email again (they shouldn't -- "Resend invite" is the fix,
// since generateLink's token is already spent/replaced at that point).
export async function inviteTeamMember(
  email: string,
  displayName?: string,
  isAdmin?: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const admin = createServiceRoleClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email: trimmedEmail,
  });
  if (error || !data.user) {
    return { ok: false, error: error?.message ?? "Couldn't create that account." };
  }

  const trimmedName = displayName?.trim();
  const { error: profileError } = await admin.from("user_profiles").upsert(
    {
      id: data.user.id,
      display_name: trimmedName ? trimmedName : null,
      is_admin: isAdmin === true,
      invite_status: "invited",
      invited_at: new Date().toISOString(),
      invited_by: adminUser.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (profileError) {
    return { ok: false, error: `Account created but couldn't save invite details: ${profileError.message}` };
  }

  try {
    await sendInviteEmail({
      to: trimmedEmail,
      invitedByName: adminUser.email,
      inviteUrl: buildConfirmUrl(data.properties.hashed_token, "invite"),
    });
  } catch (err) {
    return {
      ok: false,
      error:
        `Account created, but the invite email failed to send (${err instanceof Error ? err.message : String(err)}). ` +
        `Use "Resend invite" to try again.`,
    };
  }

  return { ok: true };
}

// "Resend invite" on the Team page -- for an account still stuck at
// "invited" or "started" (an active account has no reason to need this;
// guarded against below so a stray click can't do anything odd to a
// real account). Uses magiclink rather than invite: generateLink's
// `invite` type is for *creating* the user, and this user already
// exists from the first call -- magiclink is Supabase's documented way
// to get a fresh one-time link for an existing, already-created user.
// Lands on the exact same /auth/confirm -> /invite/set-password path
// either way, so from the recipient's side a resent invite looks
// identical to the first one.
export async function resendInvite(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin();
  const admin = createServiceRoleClient();

  const { data: profile, error: profileError } = await admin
    .from("user_profiles")
    .select("invite_status")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { ok: false, error: profileError.message };
  if (!profile || profile.invite_status !== "invited") {
    return { ok: false, error: "This account isn't mid-invite -- nothing to resend." };
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError || !userData.user?.email) {
    return { ok: false, error: userError?.message ?? "Couldn't find that account's email." };
  }

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  });
  if (error) return { ok: false, error: error.message };

  try {
    await sendInviteEmail({
      to: userData.user.email,
      invitedByName: adminUser.email,
      inviteUrl: buildConfirmUrl(data.properties.hashed_token, "magiclink"),
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  return { ok: true };
}

// "Make admin" / "Remove admin" toggle. Deliberately refuses to let an
// admin change their own flag -- with exactly two admins today (Greg,
// Justin), a misclick that demotes the only other admin while also
// demoting yourself would lock Base Camp's admin section out entirely
// with no one left who can undo it from inside the app.
export async function setAdmin(
  userId: string,
  isAdmin: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin();
  if (userId === adminUser.id) {
    return { ok: false, error: "You can't change your own admin status." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin
    .from("user_profiles")
    .update({ is_admin: isAdmin, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Reversible "Deactivate" -- bans sign-in via Supabase's own ban_duration
// rather than deleting anything, so "Reactivate" below can undo it
// cleanly. Same self-protection reasoning as setAdmin: an admin can't
// deactivate their own account (there'd be no one left with a session to
// undo it).
export async function deactivateUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin();
  if (userId === adminUser.id) {
    return { ok: false, error: "You can't deactivate your own account." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function reactivateUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: "none" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// /invite/set-password's form action -- the last step of the invite flow.
// By the time this runs, the person already has a real session (/auth/
// confirm just established it from the emailed link), so this just sets
// their password on their own account via the normal session client (no
// service-role needed for that part -- it's their own auth.updateUser
// call, same as anyone changing their own password would make) and flips
// their own invite_status to "active" so the Team page stops showing them
// as "Sent"/"Started". Full-navigation redirect after, same
// redirect()-after-mutate pattern as approval.ts/settlement.ts, rather
// than returning a value for client-side handling -- there's nowhere
// meaningful to stay on this page once the password is set.
export async function completeInviteSignup(password: string): Promise<{ ok: false; error: string } | never> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Your invite link has expired -- ask whoever invited you to resend it." };
  }
  if (password.length < 6) {
    return { ok: false, error: "Password must be at least 6 characters." };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { ok: false, error: error.message };
  }

  const admin = createServiceRoleClient();
  const { error: profileError } = await admin
    .from("user_profiles")
    .update({ invite_status: "active", updated_at: new Date().toISOString() })
    .eq("id", user.id);
  if (profileError) {
    // The password is already set and they can already sign in -- don't
    // block them over a cosmetic status flag not updating. Logged so it
    // doesn't vanish silently; an admin can still see the real state (a
    // real sign-in on an account genuinely stuck at "invited") and isn't
    // misled by it either, since "started" (which is what they'd show as
    // here) is itself an honest description of this exact situation.
    console.error(`completeInviteSignup: password set for ${user.id}, but invite_status update failed: ${profileError.message}`);
  }

  redirect("/");
}

// Permanent. The Team page requires a two-step confirm before this is
// ever called (see TeamMemberActions.tsx) -- there's no further
// confirmation here, this just does it. Removes the user_profiles row
// too (service role, bypassing the same RLS/guard-trigger concerns as
// everything else in this file) so nothing orphaned is left pointing at
// a deleted auth.users id.
export async function removeUser(userId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const adminUser = await requireAdmin();
  if (userId === adminUser.id) {
    return { ok: false, error: "You can't remove your own account." };
  }

  const admin = createServiceRoleClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  const { error: profileError } = await admin.from("user_profiles").delete().eq("id", userId);
  if (profileError) {
    // The account itself is already gone -- surface this but don't call
    // it a failure of the remove action overall, since from the admin's
    // point of view the person has, in fact, been removed.
    console.error(`removeUser: account ${userId} deleted, but its user_profiles row wasn't: ${profileError.message}`);
  }
  return { ok: true };
}
