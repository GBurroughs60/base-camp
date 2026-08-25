import Link from "next/link";

export type PlaysTableRow = {
  id: string;
  show_date: string | null;
  artist_id: string | null;
  artist_name: string | null;
  guarantee_amount: number | null;
  deal_terms: string | null;
  contract_status: string | null;
  context_label: string | null;
  context_href: string | null;
};

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return null;
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Shared, simplified Plays table used on both the Event detail page and the
// Venue detail page, so a Play always looks the same regardless of which
// association you're looking at it from. The only thing that changes is the
// "context" column: on an Event page it shows the Venue, on a Venue page it
// shows the Event -- showing the page's own record on every row would just
// be redundant.
export default function PlaysTable({
  rows,
  contextColumnLabel,
  showContract = true,
}: {
  rows: PlaysTableRow[];
  contextColumnLabel: string;
  /** Hide the Contract column -- used where contract status isn't relevant
   * to the context this table is embedded in (e.g. the Contact record). */
  showContract?: boolean;
}) {
  return (
    <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
      <table className="w-full text-sm">
        <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
          <tr>
            <th className="px-4 py-2 font-medium">Date</th>
            <th className="px-4 py-2 font-medium">Artist</th>
            <th className="px-4 py-2 font-medium">{contextColumnLabel}</th>
            <th className="px-4 py-2 font-medium">Guarantee</th>
            {showContract && <th className="px-4 py-2 font-medium">Contract</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const money = formatMoney(p.guarantee_amount);
            const guaranteeDisplay = money ?? p.deal_terms ?? "—";
            return (
              <tr
                key={p.id}
                className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
              >
                <td className="px-4 py-2 whitespace-nowrap">
                  <Link
                    href={`/plays/${p.id}`}
                    className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {p.show_date ?? "View play"}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {p.artist_id ? (
                    <Link
                      href={`/artists/${p.artist_id}`}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {p.artist_name ?? "View artist"}
                    </Link>
                  ) : (
                    p.artist_name ?? "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {p.context_href ? (
                    <Link
                      href={p.context_href}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {p.context_label}
                    </Link>
                  ) : (
                    p.context_label ?? "—"
                  )}
                </td>
                <td className="px-4 py-2 truncate max-w-[220px]" title={guaranteeDisplay}>
                  {guaranteeDisplay}
                </td>
                {showContract && (
                  <td className="px-4 py-2">{p.contract_status ?? "—"}</td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!rows.length && (
        <p className="p-6 text-sm text-black/60 dark:text-white/60">
          No plays yet.
        </p>
      )}
    </div>
  );
}
