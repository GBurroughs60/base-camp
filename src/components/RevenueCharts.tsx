// Visual (bar-chart) companions to RevenueDashboard's tables, added
// 2026-10-20 per Greg: "Can we make it all more visual? Maybe some bar
// charts as opposed to just rows of numbers?" Built per the dataviz
// skill's procedure -- form first, then color, validated with
// scripts/validate_palette.js before shipping (see docs/outreach-engine-
// plan.md section 13 for the exact runs). No new chart-library dependency;
// these are plain SVG-free HTML/CSS bars, consistent with the rest of the
// app's styling.
//
// Every number either chart shows is also in a table elsewhere on this
// page (the three Booked/Earned/Settled stat tiles for the stage chart;
// the existing by-year table for the yearly chart) -- these are a visual
// *companion*, never the only way to read a value.

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function compactMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

// -- Stage bar chart (Booked / Earned / Settled) -----------------------------

export type Stage = {
  key: "booked" | "earned" | "settled";
  label: string;
  total: number;
  count: number;
};

// Ordinal ramp -- one hue (the brand orange), light->dark = least->most
// complete. Not a categorical/identity palette (the three stages are an
// ordered progression, not independent series), so this is validated with
// the dataviz skill's `--ordinal` check rather than the 8-hue categorical
// one: monotone lightness, adjacent step >= 0.06 OKLCH L, light-end
// contrast >= 2:1 against the chart surface. Dark mode flips anchor per
// the skill's sequential-hue guidance -- the "recedes into the surface"
// end is light in light mode but dark in dark mode:
//   light: #f59475 (booked) -> #f05a2b (earned) -> #d3491f (settled)
//   dark:  #892f14 (booked) -> #f05a2b (earned) -> #f48360 (settled)
// "earned" lands on the app's own --ridge-orange token in both modes by
// construction, so it needs no arbitrary value.
const STAGE_BAR_CLASSES: Record<Stage["key"], string> = {
  booked: "bg-[#f59475] dark:bg-[#892f14]",
  earned: "bg-ridge-orange",
  settled: "bg-ridge-orange-dark dark:bg-[#f48360]",
};

export function StagesBarChart({ stages }: { stages: Stage[] }) {
  const max = Math.max(1, ...stages.map((s) => s.total));

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-4">
      <div className="space-y-3">
        {stages.map((s) => {
          const pct = s.total > 0 ? Math.max((s.total / max) * 100, 2) : 0;
          return (
            <div key={s.key} className="group flex items-center gap-3">
              <p className="w-16 shrink-0 text-sm font-medium text-right">{s.label}</p>
              <div
                className="relative flex-1 h-5 rounded-r-[4px] bg-black/[.04] dark:bg-white/[.06] border-l border-black/15 dark:border-white/15"
                title={`${s.label}: ${formatMoney(s.total)} across ${s.count} show${s.count === 1 ? "" : "s"}`}
              >
                <div
                  className={`absolute inset-y-0 left-0 rounded-r-[4px] transition-[filter] group-hover:brightness-110 ${STAGE_BAR_CLASSES[s.key]}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="min-w-[5.5rem] shrink-0 text-right tabular-nums text-sm font-medium whitespace-nowrap">
                {formatMoney(s.total)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Yearly guarantee/merch stacked bar chart (per artist) -------------------

export type YearlyRow = {
  year: number | null;
  guaranteeTotal: number;
  merchOnlyTotal: number;
  playCount: number;
};

export function YearlyRevenueChart({ rows }: { rows: YearlyRow[] }) {
  const plotHeight = 140; // px, plot area only -- labels/axis sit outside it
  const max = Math.max(1, ...rows.map((r) => r.guaranteeTotal + r.merchOnlyTotal));

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-4 mb-3">
      {/* Two series -> a legend is mandatory (never color-matching alone). */}
      <div className="flex items-center gap-4 mb-4 text-xs text-black/60 dark:text-white/60">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-ridge-orange-dark dark:bg-ridge-orange" />
          Guarantee
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-[2px] bg-[#2a78d6] dark:bg-[#3987e5]" />
          Merch
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-end gap-5 min-w-max border-b border-black/15 dark:border-white/15 pb-0">
          {rows.map((row) => {
            const combined = row.guaranteeTotal + row.merchOnlyTotal;
            const guaranteeH =
              row.guaranteeTotal > 0 ? Math.max((row.guaranteeTotal / max) * plotHeight, 2) : 0;
            const merchH = row.merchOnlyTotal > 0 ? Math.max((row.merchOnlyTotal / max) * plotHeight, 2) : 0;
            const label = row.year ?? "Undated";
            return (
              <button
                type="button"
                key={`${label}`}
                className="group relative flex flex-col items-center gap-1 shrink-0 w-14 focus:outline-none"
                aria-label={`${label}: guarantee ${formatMoney(row.guaranteeTotal)}${
                  row.merchOnlyTotal > 0 ? `, merch ${formatMoney(row.merchOnlyTotal)}` : ""
                }, total ${formatMoney(combined)} across ${row.playCount} show${row.playCount === 1 ? "" : "s"}`}
              >
                {/* Tooltip -- enhances, never gates: every value here is
                    already in the table below this chart. Shown on hover
                    AND keyboard focus (group-focus-visible). */}
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 whitespace-nowrap rounded-md bg-ridge-ink text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shadow-lg">
                  <p className="font-medium">{label}</p>
                  <p>Guarantee: {formatMoney(row.guaranteeTotal)}</p>
                  {row.merchOnlyTotal > 0 && <p>Merch: {formatMoney(row.merchOnlyTotal)}</p>}
                  <p className="text-white/60">
                    {row.playCount} show{row.playCount === 1 ? "" : "s"}
                  </p>
                </div>

                {/* Direct label -- value on the cap, always outside the
                    bar so it never needs to fit inside a thin column. */}
                <span className="text-[11px] font-medium tabular-nums text-black/70 dark:text-white/70">
                  {compactMoney(combined)}
                </span>

                {/* Stacked column: guarantee (bottom, square at the
                    baseline) + merch (top, when present). A 2px surface
                    gap (gap-0.5) separates the segments instead of a
                    border, per the skill's spacer rule. */}
                <div className="flex flex-col-reverse gap-0.5 w-8" style={{ height: plotHeight }}>
                  <div
                    className={`w-full bg-ridge-orange-dark dark:bg-ridge-orange transition-[filter] group-hover:brightness-110 ${
                      row.merchOnlyTotal > 0 ? "" : "rounded-t-[4px]"
                    }`}
                    style={{ height: `${guaranteeH}px` }}
                  />
                  {row.merchOnlyTotal > 0 && (
                    <div
                      className="w-full bg-[#2a78d6] dark:bg-[#3987e5] rounded-t-[4px] transition-[filter] group-hover:brightness-110"
                      style={{ height: `${merchH}px` }}
                    />
                  )}
                </div>

                <span className="text-[11px] text-black/50 dark:text-white/50 mt-1 whitespace-nowrap">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
