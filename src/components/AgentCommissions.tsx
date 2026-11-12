// Agent Commissions (docs/operations-accounting-plan.md section 11) --
// each internal booking agent's cut of Ridge's own booking commission on
// the plays they're credited for. Plain server-rendered table, not a
// client component like RevenueDashboard -- no sorting/filtering needed
// for a first pass with a handful of agents; add interactivity later if
// the roster grows enough to need it.

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export type AgentCommissionRow = {
  /** null for the "Unassigned" bucket -- plays with no booking agent set. */
  agentId: string | null;
  agentName: string;
  playCount: number;
  /** Ridge's own booking commission total across this agent's plays --
   * the booking leg only, never management. A play whose own commission
   * rate is unknown contributes nothing here (see hasUnknownBookingRate),
   * same "never assume a gap is zero" rule as the rest of this page. */
  bookingCommissionTotal: number;
  hasUnknownBookingRate: boolean;
  /** This agent's split, whole-number percentage, or null if never set
   * on their Settings > Team profile. */
  splitPct: number | null;
  /** bookingCommissionTotal x splitPct, or null when splitPct itself is
   * null -- never assumed to be 0% or 100% when unset. */
  agentShare: number | null;
};

export default function AgentCommissions({ rows }: { rows: AgentCommissionRow[] }) {
  const hasAnyRows = rows.some((r) => r.playCount > 0);

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-medium mb-1">Agent Commissions</h2>
      <p className="text-xs text-black/50 dark:text-white/50 mb-3">
        Each booking agent&apos;s split of The Ridge&apos;s own booking commission (never the
        management leg) on the live plays credited to them -- same scope as The Ridge Revenue
        table above. Set a split % per person on Settings &rarr; Team.
      </p>
      {!hasAnyRows ? (
        <p className="text-sm text-black/60 dark:text-white/60">
          No plays The Ridge books yet in the live pipeline.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-black/[.03] dark:bg-white/[.06] text-xs text-black/50 dark:text-white/50">
                <th className="text-left font-medium px-3 py-2">Agent</th>
                <th className="text-right font-medium px-3 py-2">Plays</th>
                <th className="text-right font-medium px-3 py-2">The Ridge&apos;s booking commission</th>
                <th className="text-right font-medium px-3 py-2">Split</th>
                <th className="text-right font-medium px-3 py-2">Agent&apos;s share</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.agentId ?? "unassigned"}
                  className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
                >
                  <td
                    className={`px-3 py-2 font-medium ${
                      row.agentId === null ? "text-black/50 dark:text-white/50 italic" : ""
                    }`}
                  >
                    {row.agentName}
                  </td>
                  <td className="px-3 py-2 text-right">{row.playCount}</td>
                  <td className="px-3 py-2 text-right">
                    {formatMoney(row.bookingCommissionTotal)}
                    {row.hasUnknownBookingRate && (
                      <span
                        className="ml-1 text-amber-600 dark:text-amber-400"
                        title="At least one play here is missing its own booking commission rate, so this total is a partial figure."
                      >
                        *
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.splitPct != null ? `${row.splitPct}%` : (
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title="No split % set for this person yet -- set one on Settings → Team."
                      >
                        rate not set
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {row.agentShare != null ? formatMoney(row.agentShare) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
