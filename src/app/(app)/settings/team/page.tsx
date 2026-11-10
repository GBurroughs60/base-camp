import { requireAdmin } from "@/lib/admin";
import { listTeamMembers } from "@/app/actions/userProfiles";
import InlineDisplayNameField from "@/components/inline/InlineDisplayNameField";
import InlineCommissionSplitField from "@/components/inline/InlineCommissionSplitField";
import InviteUserForm from "@/components/team/InviteUserForm";
import TeamMemberActions from "@/components/team/TeamMemberActions";
import StatusBadge from "@/components/team/StatusBadge";

// Admin-only (2026-11-09, per Greg -- gated like the rest of the Admin nav
// section, see src/lib/admin.ts). Originally just display names (still
// here, unchanged); now also where an admin invites a new Base Camp
// account, sees where each invite is in its lifecycle, and promotes/
// demotes, deactivates/reactivates, or removes an account. See Nav.tsx's
// adminLinks for why this sits alongside Candidates/Revenue/QuickBooks
// rather than in the main nav.
export default async function TeamSettingsPage() {
  const currentAdmin = await requireAdmin();
  const members = await listTeamMembers();

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-medium mb-1">Team</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Invite a new Base Camp account, see where each invite is at, and manage admin access. Set
        a display name for each account -- shown instead of the email address wherever someone is
        credited for an action (e.g. who pitched an event). Leave it blank to just show the email.
        Set a booking commission split for anyone who books shows -- their share of Ridge&apos;s own
        booking commission on plays credited to them (see the Agent Commissions section on Revenue).
      </p>

      <div className="mb-8">
        <InviteUserForm />
      </div>

      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/10 dark:divide-white/10">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="text-sm font-medium">
                  <InlineDisplayNameField
                    userId={member.id}
                    value={member.displayName}
                    placeholder="Add a display name"
                  />
                </div>
                {member.isAdmin && (
                  <span className="shrink-0 rounded-full bg-ridge-orange/10 text-ridge-orange-dark dark:text-ridge-orange px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide">
                    Admin
                  </span>
                )}
                <StatusBadge status={member.status} />
              </div>
              <div className="text-xs text-black/50 dark:text-white/50 truncate mt-0.5">
                {member.email}
              </div>
              <div className="text-xs text-black/50 dark:text-white/50 mt-1 flex items-center gap-1">
                <span>Booking commission split:</span>
                <InlineCommissionSplitField
                  userId={member.id}
                  value={member.bookingCommissionSplitPct}
                />
              </div>
            </div>
            <TeamMemberActions member={member} currentUserId={currentAdmin.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
