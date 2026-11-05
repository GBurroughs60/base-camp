import { listTeamMembers } from "@/app/actions/userProfiles";
import InlineDisplayNameField from "@/components/inline/InlineDisplayNameField";

// Admin settings page -- lets anyone on the team set a friendly display
// name for any Base Camp account (2026-11-05, per Greg, ahead of a third
// person joining soon). A name set here is what shows up anywhere a Base
// Camp user gets attributed to an action (e.g. outreach "pitched by");
// an account with no name set here just shows its email instead, so this
// page is optional busywork, not a blocking setup step. See Nav.tsx's
// adminLinks for why this sits alongside Candidates/Revenue/QuickBooks
// rather than in the main nav.
export default async function TeamSettingsPage() {
  const members = await listTeamMembers();

  return (
    <div className="max-w-xl">
      <h1 className="font-display text-3xl font-medium mb-1">Team</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mb-6">
        Set a display name for each Base Camp account. Shown instead of the email address
        wherever someone is credited for an action (e.g. who pitched an event). Leave it blank to
        just show the email.
      </p>

      <div className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl divide-y divide-black/10 dark:divide-white/10">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-4 px-5 py-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">
                <InlineDisplayNameField
                  userId={member.id}
                  value={member.displayName}
                  placeholder="Add a display name"
                />
              </div>
              <div className="text-xs text-black/50 dark:text-white/50 truncate mt-0.5">
                {member.email}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
