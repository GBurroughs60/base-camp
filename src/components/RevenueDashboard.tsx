"use client";

import { useMemo, useState } from "react";
import type { PlayStatus } from "@/lib/playStatus";
import { PLAY_STATUS_LABELS } from "@/lib/playStatus";
import { StagesBarChart, YearlyRevenueChart } from "./RevenueCharts";
import { SortIndicator } from "./DataTable";

type LiveSortKey = "artist" | "date" | "guarantee" | "booking" | "management" | "total";

function liveSortValue(r: LivePlayRow, key: LiveSortKey): string | number | null {
  switch (key) {
    case "artist":
      return r.artistName;
    case "date":
      return r.showDate;
    case "guarantee":
      return r.guaranteeAmount;
    case "booking":
      return r.bookingCommission;
    case "management":
      return r.managementCommission;
    case "total":
      return r.totalRidgeRevenue;
  }
}

export type RevenueStage = "booked" | "earned" | "settled";

export type LivePlayRow = {
  playId: string;
  artistId: string;
  artistName: string;
  status: PlayStatus;
  stage: RevenueStage | null;
  showDate: string | null;
  guaranteeAmount: number | null;
  bookingCommission: number | null;
  managementCommission: number | null;
  // Always a real number -- the sum of whichever leg(s) are known. See
  // missingBookingRate/missingManagementRate for which leg, if any, is
  // still a gap (and so held out of this total).
  totalRidgeRevenue: number;
  missingBookingRate: boolean;
  missingManagementRate: boolean;
  missingGuaranteeAmount: boolean;
};

export type HistoricalYearRow = {
  artistId: string;
  artistName: string;
  year: number | null;
  guaranteeTotal: number;
  guaranteeMerchTotal: number;
  playCount: number;
};

type RangePreset = "ytd" | "priorYear" | "all" | "custom";

function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function toDateOnly(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export default function RevenueDashboard({
  liveRows,
  historicalRows,
}: {
  liveRows: LivePlayRow[];
  historicalRows: HistoricalYearRow[];
}) {
  // Defaults to All Time rather than YTD -- with real bookings often
  // dated months out, a YTD window (Jan 1 - today) can look empty even
  // when there's real booked business on the books for later this year
  // or beyond. YTD/Prior Year stay available as filters once there's a
  // real Earned history to compare year over year.
  const [range, setRange] = useState<RangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  // Sortable live-plays table (Greg, 2026-10-20: "make this list of plays
  // sortable by date, artist alphabetically and amounts"). Defaults to
  // show date ascending, matching the date-first convention the rest of
  // the app's list pages already use (e.g. /plays' defaultSortKey="date").
  const [liveSortKey, setLiveSortKey] = useState<LiveSortKey>("date");
  const [liveSortDir, setLiveSortDir] = useState<"asc" | "desc">("asc");

  function toggleLiveSort(key: LiveSortKey) {
    if (liveSortKey === key) {
      setLiveSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setLiveSortKey(key);
      setLiveSortDir("asc");
    }
  }

  const today = useMemo(() => new Date(), []);
  const currentYear = today.getUTCFullYear();

  const { start, end, label } = useMemo(() => {
    if (range === "ytd") {
      return {
        start: new Date(Date.UTC(currentYear, 0, 1)),
        end: today,
        label: `${currentYear} year to date`,
      };
    }
    if (range === "priorYear") {
      return {
        start: new Date(Date.UTC(currentYear - 1, 0, 1)),
        end: new Date(Date.UTC(currentYear - 1, 11, 31)),
        label: `${currentYear - 1} (full year)`,
      };
    }
    if (range === "custom") {
      return {
        start: customStart ? toDateOnly(customStart) : null,
        end: customEnd ? toDateOnly(customEnd) : null,
        label:
          customStart && customEnd
            ? `${customStart} to ${customEnd}`
            : "Pick both a start and end date",
      };
    }
    return { start: null, end: null, label: "All time" };
  }, [range, currentYear, today, customStart, customEnd]);

  const inRange = (showDate: string | null): boolean => {
    if (!showDate) return false; // undated plays can't be placed in any bounded range
    if (!start || !end) return range === "all";
    const d = toDateOnly(showDate);
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
  };

  // Missing-rate banner is deliberately NOT range-filtered -- a data gap
  // needs fixing regardless of which window you're looking at. These rows
  // are no longer excluded from the totals/table below (2026-10-20, per
  // Greg re: Brittany Elise) -- a missing leg withholds only its own
  // commission, never a different leg that's already known -- so this
  // banner is now purely a "here's what's still incomplete" flag, not an
  // "these dollars are missing from the numbers below" one.
  const missingRateRows = liveRows.filter((r) => r.missingBookingRate || r.missingManagementRate);

  // A live play with no show_date can't be placed in any range -- including
  // "All Time," which otherwise reads as "no date restriction." Rather than
  // let it silently vanish from every total (the exact "blank treated as
  // zero" gap this tracker is built to avoid), surface it the same way:
  // called out, excluded until fixed. Unlike a missing commission rate,
  // a missing date can't be partially resolved, so this one stays an
  // outright exclusion.
  const missingShowDateRows = liveRows.filter((r) => !r.showDate);

  const filteredLiveRows = liveRows.filter((r) => inRange(r.showDate));

  // Same null-last, numeric-aware comparator DataTable uses elsewhere in
  // the app, so sorting behaves the same way here as it does on every
  // other list page.
  const sortedLiveRows = useMemo(() => {
    const withKeys = filteredLiveRows.map((r) => ({ r, v: liveSortValue(r, liveSortKey) }));
    withKeys.sort((a, b) => {
      if (a.v === null || a.v === undefined) return 1;
      if (b.v === null || b.v === undefined) return -1;
      if (typeof a.v === "number" && typeof b.v === "number") return a.v - b.v;
      return String(a.v).localeCompare(String(b.v), undefined, { numeric: true });
    });
    const ordered = withKeys.map((x) => x.r);
    return liveSortDir === "desc" ? ordered.reverse() : ordered;
  }, [filteredLiveRows, liveSortKey, liveSortDir]);

  const totals = useMemo(() => {
    const t = {
      booked: { total: 0, count: 0 },
      earned: { total: 0, count: 0 },
      settled: { total: 0, count: 0 },
    };
    for (const r of filteredLiveRows) {
      if (r.stage === "booked") {
        t.booked.total += r.totalRidgeRevenue ?? 0;
        t.booked.count += 1;
      } else if (r.stage === "earned") {
        t.earned.total += r.totalRidgeRevenue ?? 0;
        t.earned.count += 1;
      } else if (r.stage === "settled") {
        t.settled.total += r.totalRidgeRevenue ?? 0;
        t.settled.count += 1;
      }
    }
    return t;
  }, [filteredLiveRows]);

  const historicalByArtist = useMemo(() => {
    const map = new Map<string, { artistName: string; rows: HistoricalYearRow[] }>();
    for (const row of historicalRows) {
      // Greg (2026-10-20): hide the "Undated" bucket from this view --
      // it's a secondary historical trend (not Ridge's owed revenue), and
      // a year-less row with nothing to anchor it to just reads as
      // clutter here, both in the table and the by-year bar chart. The
      // underlying data isn't touched, just this display.
      if (row.year === null) continue;
      const existing = map.get(row.artistId) ?? { artistName: row.artistName, rows: [] };
      existing.rows.push(row);
      map.set(row.artistId, existing);
    }
    return Array.from(map.values());
  }, [historicalRows]);

  return (
    <div className="space-y-8">
      {/* Missing commission-rate warning -- always visible regardless of the
          date filter below. */}
      {missingRateRows.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {missingRateRows.length} play{missingRateRows.length === 1 ? "" : "s"} missing a
            commission rate — the known leg is still counted below (flagged with *); the
            missing leg isn&apos;t, until it&apos;s added
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700/80 dark:text-amber-400/80">
            {missingRateRows.map((r) => (
              <li key={r.playId}>
                {r.artistName} — {PLAY_STATUS_LABELS[r.status]}
                {r.showDate ? ` (${r.showDate})` : ""}: guarantee {formatMoney(r.guaranteeAmount)}.{" "}
                {r.missingBookingRate && r.missingManagementRate
                  ? "No booking or management rate on file, so this play currently contributes $0 below."
                  : r.missingBookingRate
                    ? `No booking rate on file -- only its management commission (${formatMoney(r.managementCommission)}) is counted below.`
                    : `No management rate on file -- only its booking commission (${formatMoney(r.bookingCommission)}) is counted below.`}
              </li>
            ))}
          </ul>
        </div>
      )}

      {missingShowDateRows.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
            {missingShowDateRows.length} play{missingShowDateRows.length === 1 ? "" : "s"} missing a
            show date — excluded from every range above (including All Time) until fixed
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-700/80 dark:text-amber-400/80">
            {missingShowDateRows.map((r) => (
              <li key={r.playId}>
                {r.artistName} — {PLAY_STATUS_LABELS[r.status]}: guarantee {formatMoney(r.guaranteeAmount)},
                Ridge total {formatMoney(r.totalRidgeRevenue)}.
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Ridge's own revenue -- Booked / Earned / Settled */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-xl font-medium">Ridge&apos;s revenue</h2>
          <div className="flex items-center gap-2 text-sm">
            {(
              [
                { key: "all", label: "All Time" },
                { key: "ytd", label: "Current YTD" },
                { key: "priorYear", label: "Prior Year" },
                { key: "custom", label: "Custom" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setRange(opt.key)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors " +
                  (range === opt.key
                    ? "bg-ridge-orange text-white"
                    : "border border-black/15 dark:border-white/15 text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5")
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {range === "custom" && (
          <div className="flex items-center gap-2 mb-3 text-sm">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
            />
            <span className="text-black/40 dark:text-white/40">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded border border-black/15 dark:border-white/15 bg-white dark:bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-ridge-orange"
            />
          </div>
        )}

        <p className="text-xs text-black/50 dark:text-white/50 mb-3">
          By show date — {label}
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <RevenueTile title="Booked" sub="Projected — not yet played" total={totals.booked.total} count={totals.booked.count} />
          <RevenueTile title="Earned" sub="Played — show happened" total={totals.earned.total} count={totals.earned.count} />
          <RevenueTile title="Settled" sub="Manually closed out" total={totals.settled.total} count={totals.settled.count} />
        </div>

        {(totals.booked.count > 0 || totals.earned.count > 0 || totals.settled.count > 0) && (
          <div className="mt-3">
            <StagesBarChart
              stages={[
                { key: "booked", label: "Booked", total: totals.booked.total, count: totals.booked.count },
                { key: "earned", label: "Earned", total: totals.earned.total, count: totals.earned.count },
                { key: "settled", label: "Settled", total: totals.settled.total, count: totals.settled.count },
              ]}
            />
          </div>
        )}

        {filteredLiveRows.length > 0 && (
          <div className="mt-4 overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/[.03] dark:bg-white/[.06] text-xs text-black/50 dark:text-white/50">
                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("artist")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Artist</span>
                      <SortIndicator active={liveSortKey === "artist"} dir={liveSortDir} />
                    </button>
                  </th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("date")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Show date</span>
                      <SortIndicator active={liveSortKey === "date"} dir={liveSortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("guarantee")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Guarantee</span>
                      <SortIndicator active={liveSortKey === "guarantee"} dir={liveSortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("booking")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Booking commission</span>
                      <SortIndicator active={liveSortKey === "booking"} dir={liveSortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("management")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Management commission</span>
                      <SortIndicator active={liveSortKey === "management"} dir={liveSortDir} />
                    </button>
                  </th>
                  <th className="text-right px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleLiveSort("total")}
                      className="inline-flex items-center gap-1 hover:text-black dark:hover:text-white transition-colors"
                    >
                      <span>Ridge total</span>
                      <SortIndicator active={liveSortKey === "total"} dir={liveSortDir} />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedLiveRows.map((r, i) => {
                  const isPartial = r.missingBookingRate || r.missingManagementRate;
                  return (
                    <tr
                      key={r.playId}
                      className={i > 0 ? "border-t border-black/10 dark:border-white/10" : ""}
                    >
                      <td className="px-3 py-2">{r.artistName}</td>
                      <td className="px-3 py-2">{PLAY_STATUS_LABELS[r.status]}</td>
                      <td className="px-3 py-2">{r.showDate ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.guaranteeAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.bookingCommission)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(r.managementCommission)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">
                        {formatMoney(r.totalRidgeRevenue)}
                        {isPartial && (
                          <span
                            className="ml-1 text-amber-600 dark:text-amber-400"
                            title="Partial -- a commission rate is still missing for this play; see the note above."
                          >
                            *
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Historical gross -- lower priority, includes legacy data */}
      <section>
        <h2 className="font-display text-xl font-medium mb-1">Artist gross revenue by year</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mb-3">
          What each show actually paid the artist — guarantee, and guarantee plus merch. No Ridge
          commission applied. Includes every play on file, including the historical import.
        </p>
        {historicalByArtist.map((group) => (
          <div key={group.artistName} className="mb-4">
            <p className="text-sm font-medium mb-2">{group.artistName}</p>
            <YearlyRevenueChart
              rows={group.rows.map((row) => ({
                year: row.year,
                guaranteeTotal: row.guaranteeTotal,
                // guaranteeMerchTotal is guarantee + merch combined; the
                // chart's top segment is merch alone, so back it out here
                // rather than double-counting the guarantee portion.
                merchOnlyTotal: Math.max(row.guaranteeMerchTotal - row.guaranteeTotal, 0),
                playCount: row.playCount,
              }))}
            />
            <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-black/[.03] dark:bg-white/[.06] text-xs text-black/50 dark:text-white/50">
                    <th className="text-left px-3 py-2">Year</th>
                    <th className="text-right px-3 py-2">Shows</th>
                    <th className="text-right px-3 py-2">Guarantee total</th>
                    <th className="text-right px-3 py-2">Guarantee + merch total</th>
                  </tr>
                </thead>
                <tbody>
                  {group.rows.map((row, i) => (
                    <tr
                      key={`${row.artistId}-${row.year ?? "undated"}`}
                      className={i > 0 ? "border-t border-black/10 dark:border-white/10" : ""}
                    >
                      <td className="px-3 py-2">{row.year ?? "Undated"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.playCount}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.guaranteeTotal)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.guaranteeMerchTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {historicalByArtist.length === 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">No play history on file yet.</p>
        )}
      </section>
    </div>
  );
}

function RevenueTile({
  title,
  sub,
  total,
  count,
}: {
  title: string;
  sub: string;
  total: number;
  count: number;
}) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-3">
      <p className="text-xs font-medium text-black/50 dark:text-white/50">{title}</p>
      <p className="text-2xl font-display font-medium mt-1">{formatMoney(total)}</p>
      <p className="text-xs text-black/50 dark:text-white/50 mt-1">
        {sub} · {count} show{count === 1 ? "" : "s"}
      </p>
    </div>
  );
}
