// Plain (non-server-action) helper, deliberately split out of
// app/actions/userProfiles.ts: every top-level export of a "use server"
// file is treated as a Server Action by Next.js, and a Server Action must
// be async -- this is a synchronous pure function, so it can't live there
// (see the add_user_profiles migration / userProfiles.ts for the
// user_profiles table and the actions that actually read/write it).
export function resolveDisplayName(member: { email: string; displayName: string | null }): string {
  return member.displayName && member.displayName.trim() !== "" ? member.displayName : member.email;
}
