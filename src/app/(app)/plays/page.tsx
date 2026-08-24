import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function PlaysPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const { year } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("plays")
    .select(
      "id, show_date, venue_name, venue_id, city, state, set_type, attendance, tickets_sold, gross_revenue, contract_status, event_id, artists(name), events(name), venue:companies!plays_venue_id_fkey(id, name)"
    )
    .order("show_date", { ascending: true });

  if (year) {
    query = query
      .gte("show_date", `${year}-01-01`)
      .lte("show_date", `${year}-12-31`);
  }

  const { data: plays } = await query;

  const years = ["2022", "2023", "2024", "2025", "2026", "2027"];

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Plays</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {plays?.length ?? 0} shows{year ? ` in ${year}` : ""}
      </p>

      <div className="flex gap-2 mb-6 text-sm">
        <Link
          href="/plays"
          className={`px-3 py-1 rounded-full border transition-colors ${
            !year
              ? "bg-ridge-orange text-white border-transparent"
              : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
          }`}
        >
          All
        </Link>
        {years.map((y) => (
          <a
            key={y}
            href={`/plays?year=${y}`}
            className={`px-3 py-1 rounded-full border transition-colors ${
              year === y
                ? "bg-ridge-orange text-white border-transparent"
                : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
            }`}
          >
            {y}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Artist</th>
              <th className="px-4 py-2 font-medium">Venue</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Event</th>
              <th className="px-4 py-2 font-medium">Set</th>
              <th className="px-4 py-2 font-medium">Attendance</th>
              <th className="px-4 py-2 font-medium">Gross Revenue</th>
              <th className="px-4 py-2 font-medium">Contract</th>
            </tr>
          </thead>
          <tbody>
            {plays?.map((t) => (
              <tr
                key={t.id}
                className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
              >
                <td className="px-4 py-2 whitespace-nowrap">
                  <Link
                    href={`/plays/${t.id}`}
                    className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {t.show_date ?? "View play"}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {(t.artists as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {(() => {
                    const venue = t.venue as unknown as { id: string; name: string } | null;
                    if (venue) {
                      return (
                        <Link
                          href={`/companies/${venue.id}`}
                          className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                        >
                          {venue.name}
                        </Link>
                      );
                    }
                    return t.venue_name ?? "—";
                  })()}
                </td>
                <td className="px-4 py-2">
                  {[t.city, t.state].filter(Boolean).join(", ") || "—"}
                </td>
                <td className="px-4 py-2">
                  {t.event_id ? (
                    <Link
                      href={`/events/${t.event_id}`}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {(t.events as unknown as { name: string } | null)?.name ??
                        "View event"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">{t.set_type ?? "—"}</td>
                <td className="px-4 py-2">{t.attendance ?? "—"}</td>
                <td className="px-4 py-2">{formatMoney(t.gross_revenue)}</td>
                <td className="px-4 py-2">{t.contract_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!plays?.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            No plays yet.
          </p>
        )}
      </div>
    </div>
  );
}
