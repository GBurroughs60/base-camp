// Single source of truth for the play/offer pipeline status field. Shared
// across the Play detail badge, the Plays list column + filter pills, and
// the Kanban board so the status list, labels, and colors never drift out
// of sync between those three surfaces.

export type PlayStatus =
  | "offer_submitted"
  | "pending_agent_approval"
  | "pending_approval"
  | "contract_sent"
  | "confirmed"
  | "played"
  | "settled"
  | "declined"
  | "cancelled"
  | "legacy";

export const PLAY_STATUS_LABELS: Record<PlayStatus, string> = {
  offer_submitted: "Offer Submitted",
  pending_agent_approval: "Pending Agent Approval",
  pending_approval: "Pending Management Approval",
  contract_sent: "Contract Sent",
  confirmed: "Confirmed",
  played: "Played",
  settled: "Settled",
  declined: "Declined",
  cancelled: "Cancelled",
  legacy: "Legacy",
};

export const PLAY_STATUS_OPTIONS: { value: PlayStatus; label: string }[] = (
  Object.keys(PLAY_STATUS_LABELS) as PlayStatus[]
).map((value) => ({ value, label: PLAY_STATUS_LABELS[value] }));

// Ordered left-to-right as the Kanban board's columns. Legacy, Declined,
// and Cancelled are deliberately excluded -- they're historical or
// terminal off-ramps, not stops an active offer moves through.
export const LIVE_PIPELINE_STATUSES: PlayStatus[] = [
  "offer_submitted",
  "pending_agent_approval",
  "pending_approval",
  "contract_sent",
  "confirmed",
  "played",
  "settled",
];

export const PLAY_STATUS_BADGE_CLASSES: Record<PlayStatus, string> = {
  offer_submitted:
    "border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06]",
  pending_agent_approval:
    "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/5",
  pending_approval:
    "border-amber-500/30 text-amber-700 dark:text-amber-400 bg-amber-500/5",
  contract_sent: "border-blue-500/30 text-blue-700 dark:text-blue-400 bg-blue-500/5",
  confirmed: "border-indigo-500/30 text-indigo-700 dark:text-indigo-400 bg-indigo-500/5",
  played: "border-purple-500/30 text-purple-700 dark:text-purple-400 bg-purple-500/5",
  settled: "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5",
  declined: "border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/5",
  cancelled: "border-red-500/30 text-red-700 dark:text-red-400 bg-red-500/5",
  legacy:
    "border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06] text-black/50 dark:text-white/50",
};

// Broad filter-pill buckets for the Plays list page. `statuses: null` means
// no filter (show everything).
export const STATUS_FILTER_GROUPS: {
  key: string;
  label: string;
  statuses: PlayStatus[] | null;
}[] = [
  { key: "all", label: "All", statuses: null },
  { key: "active", label: "Active Pipeline", statuses: LIVE_PIPELINE_STATUSES },
  { key: "legacy", label: "Legacy", statuses: ["legacy"] },
  { key: "closed", label: "Declined / Cancelled", statuses: ["declined", "cancelled"] },
];
