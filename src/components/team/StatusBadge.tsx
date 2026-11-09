import type { TeamMemberStatus } from "@/app/actions/userProfiles";

// Exactly the three states Greg asked for, plus "deactivated" (approved
// separately, same request) -- see computeStatus in app/actions/
// userProfiles.ts for how each one is actually derived.
const LABELS: Record<TeamMemberStatus, string> = {
  invited: "Sent",
  started: "Started",
  active: "Active",
  deactivated: "Deactivated",
};

const CLASSES: Record<TeamMemberStatus, string> = {
  invited: "bg-black/5 dark:bg-white/10 text-black/60 dark:text-white/60",
  started: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  active: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  deactivated: "bg-red-500/10 text-red-700 dark:text-red-400",
};

export default function StatusBadge({ status }: { status: TeamMemberStatus }) {
  return (
    <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium " + CLASSES[status]}>
      {LABELS[status]}
    </span>
  );
}
