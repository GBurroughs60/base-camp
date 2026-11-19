// Weekly pitch-volume chart for /pitch-activity, added 2026-11-19 per Greg
// ("can we build an activity tracker... total pitches every week... broken
// out by each artist"). Same house style as RevenueCharts.tsx: plain
// HTML/CSS bars (no chart-library dependency), built per the dataviz
// skill's procedure -- form (stacked bar, "see the split change over
// time") then color, validated with scripts/validate_palette.js before
// shipping:
//   node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100"
//     --mode light --surface "#ffffff"   -> ALL CHECKS PASS (contrast WARN
//     on aqua/yellow -- relief rule: direct labels + the table below, both
//     present here, satisfy it)
//   node scripts/validate_palette.js "#3987e5,#d95926,#199e70,#c98500"
//     --mode dark --surface "#171717"    -> ALL CHECKS PASS
// This is the default categorical theme's first four slots (blue, orange,
// aqua, yellow), in fixed order -- never reassigned per week, so an
// artist's color stays the same bar to bar even as weekly totals swing
// (see the skill's "color follows the entity, never its rank").
//
// Every number this chart shows is also in the table directly below it --
// same "chart is a companion, never the only way to read a value" rule
// RevenueCharts.tsx follows.

export type ArtistSeries = { id: string; name: string };

export type WeekBucket = {
  weekStart: string; // ISO date (Monday)
  rangeLabel: string; // "Nov 9 - 15"
  shortLabel: string; // "Nov 9" (x-axis tick)
  isPartial: boolean; // the current, still-filling-in week
  countsByArtist: Record<string, number>; // artistId -> count, capped to the first 8 colored slots
  otherCount: number; // pitches for an artist beyond the 8-slot cap, if that ever happens
  unattributedCount: number; // outreach_log rows with no artist selected (see page.tsx)
};

// First 4 of the dataviz skill's validated 8-slot default categorical
// theme -- see the file-header comment for the exact validator runs.
// Fixed order, never cycled; a 9th+ artist folds into "Other" rather than
// generating a new hue.
const SERIES_BAR_CLASSES = [
  "bg-[#2a78d6] dark:bg-[#3987e5]", // 1 blue
  "bg-[#eb6834] dark:bg-[#d95926]", // 2 orange
  "bg-[#1baf7a] dark:bg-[#199e70]", // 3 aqua
  "bg-[#eda100] dark:bg-[#c98500]", // 4 yellow
  "bg-[#e87ba4] dark:bg-[#d55181]", // 5 magenta
  "bg-[#008300] dark:bg-[#0ca30c]", // 6 green
  "bg-[#6250d6] dark:bg-[#9085e9]", // 7 violet
  "bg-[#e34948] dark:bg-[#e66767]", // 8 red
] as const;
const SERIES_DOT_CLASSES = SERIES_BAR_CLASSES;
const MAX_SERIES = SERIES_BAR_CLASSES.length;

const OTHER_BAR_CLASS = "bg-black/25 dark:bg-white/25";
const UNATTRIBUTED_BAR_CLASS = "bg-black/10 dark:bg-white/10";

function weekTotal(w: WeekBucket): number {
  return (
    Object.values(w.countsByArtist).reduce((a, b) => a + b, 0) + w.otherCount + w.unattributedCount
  );
}

export function PitchActivityChart({
  artists,
  weeks,
}: {
  artists: ArtistSeries[]; // already capped to MAX_SERIES, fixed order
  weeks: WeekBucket[];
}) {
  const plotHeight = 140; // px, plot area only
  const max = Math.max(1, ...weeks.map(weekTotal));
  const hasOther = weeks.some((w) => w.otherCount > 0);
  const hasUnattributed = weeks.some((w) => w.unattributedCount > 0);

  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-4 mb-3">
      {/* Legend -- mandatory for 2+ series, every slot direct-labeled since
          we're at or under 4 (the dataviz skill's direct-label threshold). */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-4 text-xs text-black/60 dark:text-white/60">
        {artists.map((a, i) => (
          <span key={a.id} className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-[2px] ${SERIES_DOT_CLASSES[i]}`} />
            {a.name}
          </span>
        ))}
        {hasOther && (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-[2px] ${OTHER_BAR_CLASS}`} />
            Other
          </span>
        )}
        {hasUnattributed && (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-[2px] ${UNATTRIBUTED_BAR_CLASS}`} />
            No artist selected
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <div className="flex items-end gap-4 min-w-max border-b border-black/15 dark:border-white/15 pb-0">
          {weeks.map((w) => {
            const total = weekTotal(w);
            const segments: { key: string; count: number; cls: string }[] = [
              ...artists.map((a, i) => ({
                key: a.id,
                count: w.countsByArtist[a.id] ?? 0,
                cls: SERIES_BAR_CLASSES[i],
              })),
              ...(w.otherCount > 0 ? [{ key: "other", count: w.otherCount, cls: OTHER_BAR_CLASS }] : []),
              ...(w.unattributedCount > 0
                ? [{ key: "unattributed", count: w.unattributedCount, cls: UNATTRIBUTED_BAR_CLASS }]
                : []),
            ];

            return (
              <button
                type="button"
                key={w.weekStart}
                className="group relative flex flex-col items-center gap-1 shrink-0 w-14 focus:outline-none"
                aria-label={`Week of ${w.rangeLabel}${w.isPartial ? " (in progress)" : ""}: ${total} pitch${total === 1 ? "" : "es"}, ${artists
                  .map((a) => `${a.name} ${w.countsByArtist[a.id] ?? 0}`)
                  .join(", ")}`}
              >
                {/* Tooltip -- every value here is already in the table
                    below this chart. */}
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-10 whitespace-nowrap rounded-md bg-ridge-ink text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity shadow-lg">
                  <p className="font-medium">
                    {w.rangeLabel}
                    {w.isPartial ? " (in progress)" : ""}
                  </p>
                  {artists.map((a, i) =>
                    (w.countsByArtist[a.id] ?? 0) > 0 ? (
                      <p key={a.id} className="flex items-center gap-1.5">
                        <span className={`inline-block w-2 h-2 rounded-[2px] ${SERIES_DOT_CLASSES[i]}`} />
                        {a.name}: {w.countsByArtist[a.id]}
                      </p>
                    ) : null
                  )}
                  {w.otherCount > 0 && <p>Other: {w.otherCount}</p>}
                  {w.unattributedCount > 0 && <p>No artist selected: {w.unattributedCount}</p>}
                  <p className="text-white/60">Total: {total}</p>
                </div>

                {/* Direct total label -- always outside the bar. */}
                <span className="text-[11px] font-medium tabular-nums text-black/70 dark:text-white/70">
                  {total}
                </span>

                <div
                  className={`flex flex-col-reverse gap-0.5 w-8 ${
                    w.isPartial ? "opacity-60 outline outline-1 outline-dashed outline-black/20 dark:outline-white/25 rounded-t-[4px]" : ""
                  }`}
                  style={{ height: plotHeight }}
                >
                  {segments.map((seg, i) => {
                    const h = seg.count > 0 ? Math.max((seg.count / max) * plotHeight, 2) : 0;
                    if (h === 0) return null;
                    return (
                      <div
                        key={seg.key}
                        className={`w-full transition-[filter] group-hover:brightness-110 ${seg.cls} ${
                          i === segments.length - 1 && !w.isPartial ? "rounded-t-[4px]" : ""
                        }`}
                        style={{ height: `${h}px` }}
                      />
                    );
                  })}
                </div>

                <span className="text-[11px] text-black/50 dark:text-white/50 mt-1 whitespace-nowrap">
                  {w.shortLabel}
                  {w.isPartial && <span className="block text-black/35 dark:text-white/35">so far</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { MAX_SERIES };
