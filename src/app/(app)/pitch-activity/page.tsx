import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import { fetchAllRows } from "@/lib/fetchAllRows";
import { PitchActivityChart, MAX_SERIES, type ArtistSeries, type WeekBucket } from "@/components/PitchActivityChart";

// Pitch-volume report, added 2026-11-19 per Greg: "can we show a report of
// total pitches every week and how that compares to the week prior by
// percent, and then break that out by each artist." outreach_log is the
// foundation this reads -- one row per artist actually pitched, written by
// completeActionItem (src/app/actions/actionItems.ts) whenever a staffer
// marks an auto (event-linked) Action List item complete, per
// docs/outreach-engine-plan.md section 2a. 977 real rows on file as of
// this build, spanning 2026-09-25 onward across all 4 roster artists --
// comfortably past the volume docs/outreach-engine-plan.md section 13
// flagged as the prerequisite for this kind of effectiveness reporting
// ("deferred until there's enough volume... for a conversion rate to be
// meaningful").
//
// Admin-only, same gate as every other page in this nav section
// (candidates/revenue/settings) -- see src/lib/admin.ts.

type OutreachLogRow = { artist_id: string | null; sent_at: string };

function mondayOfUtc(d: Date): Date {
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shortLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function rangeLabel(monday: Date): string {
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const sameMonth = monday.getUTCMonth() === sunday.getUTCMonth();
  const start = monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const end = sunday.toLocaleDateString("en-US", {
    month: sameMonth ? undefined : "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return `${start} - ${end}`;
}

function pctChangeLabel(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? "No pitches either week" : "Up from zero the week before";
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct);
  return `${rounded >= 0 ? "+" : ""}${rounded}% vs the week before`;
}

export default async function PitchActivityPage() {
  await requireAdmin();

  const supabase = await createClient();

  const { rows: logRows } = await fetchAllRows<OutreachLogRow>((from, to) =>
    supabase
      .from("outreach_log")
      .select("artist_id, sent_at")
      .eq("status", "sent")
      .order("sent_at")
      .range(from, to)
  );

  const artistIds = Array.from(
    new Set(logRows.map((r) => r.artist_id).filter((v): v is string => !!v))
  );

  const { data: artistRows } = artistIds.length
    ? await supabase.from("artists").select("id, name").in("id", artistIds).order("name")
    : { data: [] as { id: string; name: string }[] };

  // Fixed order (alphabetical), capped to the chart's 8-slot categorical
  // theme -- see PitchActivityChart.tsx. Every artist pitched today (4)
  // fits well inside that cap; anyone beyond slot 8 folds into "Other"
  // rather than generating a new hue, per the dataviz skill.
  const allArtists: ArtistSeries[] = (artistRows ?? []).map((a) => ({ id: a.id, name: a.name }));
  const artists = allArtists.slice(0, MAX_SERIES);
  const otherArtistIds = new Set(allArtists.slice(MAX_SERIES).map((a) => a.id));

  if (logRows.length === 0) {
    return (
      <div>
        <h1 className="font-display text-3xl font-medium mb-1">Pitch Activity</h1>
        <p className="text-black/60 dark:text-white/60 mb-6">
          No pitches on file yet. This fills in as Action List items get marked complete.
        </p>
      </div>
    );
  }

  // Build a contiguous Monday-start week series from the earliest pitch
  // through the current (possibly partial) week, zero-filling any week
  // with no activity -- a real gap (see the Oct 5-19 run below) is
  // meaningful information, not something to silently skip.
  const now = new Date();
  const firstMonday = mondayOfUtc(new Date(logRows[0].sent_at));
  const currentMonday = mondayOfUtc(now);

  const buckets = new Map<string, WeekBucket>();
  for (let d = new Date(firstMonday); d <= currentMonday; d.setUTCDate(d.getUTCDate() + 7)) {
    const key = isoDate(d);
    buckets.set(key, {
      weekStart: key,
      rangeLabel: rangeLabel(d),
      shortLabel: shortLabel(d),
      isPartial: key === isoDate(currentMonday),
      countsByArtist: {},
      otherCount: 0,
      unattributedCount: 0,
    });
  }

  for (const row of logRows) {
    const key = isoDate(mondayOfUtc(new Date(row.sent_at)));
    const bucket = buckets.get(key);
    if (!bucket) continue; // shouldn't happen -- every row's week is in range by construction

    if (!row.artist_id) {
      bucket.unattributedCount += 1;
    } else if (otherArtistIds.has(row.artist_id)) {
      bucket.otherCount += 1;
    } else {
      bucket.countsByArtist[row.artist_id] = (bucket.countsByArtist[row.artist_id] ?? 0) + 1;
    }
  }

  const weeks = Array.from(buckets.values());

  const weekTotal = (w: WeekBucket) =>
    Object.values(w.countsByArtist).reduce((a, b) => a + b, 0) + w.otherCount + w.unattributedCount;

  const completedWeeks = weeks.filter((w) => !w.isPartial);
  const lastCompleted = completedWeeks[completedWeeks.length - 1] ?? null;
  const priorCompleted = completedWeeks[completedWeeks.length - 2] ?? null;
  const currentWeek = weeks[weeks.length - 1]; // always the partial/current one by construction

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Pitch Activity</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        Every pitch logged from the Action List ({logRows.length} on file since{" "}
        {new Date(logRows[0].sent_at).toLocaleDateString("en-US", {
          month: "long",
          day: "numeric",
          year: "numeric",
          timeZone: "UTC",
        })}
        ), by week.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-3xl">
        <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-3">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">This week so far</p>
          <p className="text-2xl font-display font-medium mt-1">{currentWeek ? weekTotal(currentWeek) : 0}</p>
          <p className="text-xs text-black/50 dark:text-white/50 mt-1">{currentWeek?.rangeLabel}, still filling in</p>
        </div>
        <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-3">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">Last complete week</p>
          <p className="text-2xl font-display font-medium mt-1">{lastCompleted ? weekTotal(lastCompleted) : "—"}</p>
          <p className="text-xs text-black/50 dark:text-white/50 mt-1">
            {lastCompleted && priorCompleted
              ? pctChangeLabel(weekTotal(lastCompleted), weekTotal(priorCompleted))
              : lastCompleted
                ? lastCompleted.rangeLabel
                : "Not enough history yet"}
          </p>
        </div>
        <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-3">
          <p className="text-xs font-medium text-black/50 dark:text-white/50">Total logged</p>
          <p className="text-2xl font-display font-medium mt-1">{logRows.length}</p>
          <p className="text-xs text-black/50 dark:text-white/50 mt-1">across {weeks.length} weeks on file</p>
        </div>
      </div>

      <p className="text-xs text-black/40 dark:text-white/40 mb-4 max-w-2xl">
        Volume here tracks when a staffer marked an Action List item complete, not a steady daily
        cadence -- a week-over-week jump often means a Discovery/Catch-up/Refresh batch surfaced a
        run of new opportunities at once, then several got pitched in one sitting, not that the
        pace of outreach itself changed that much.
      </p>

      <PitchActivityChart artists={artists} weeks={weeks} />

      <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left border-b border-black/10 dark:border-white/10">
              <th className="px-4 py-2 font-medium text-black/40 dark:text-white/40 text-xs uppercase tracking-wide">
                Week
              </th>
              {artists.map((a) => (
                <th
                  key={a.id}
                  className="px-4 py-2 font-medium text-black/40 dark:text-white/40 text-xs uppercase tracking-wide text-right"
                >
                  {a.name}
                </th>
              ))}
              {weeks.some((w) => w.otherCount > 0) && (
                <th className="px-4 py-2 font-medium text-black/40 dark:text-white/40 text-xs uppercase tracking-wide text-right">
                  Other
                </th>
              )}
              {weeks.some((w) => w.unattributedCount > 0) && (
                <th className="px-4 py-2 font-medium text-black/40 dark:text-white/40 text-xs uppercase tracking-wide text-right">
                  No artist selected
                </th>
              )}
              <th className="px-4 py-2 font-medium text-black/40 dark:text-white/40 text-xs uppercase tracking-wide text-right">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((w) => (
              <tr key={w.weekStart} className="border-b border-black/5 dark:border-white/5 last:border-0">
                <td className="px-4 py-2 whitespace-nowrap">
                  {w.rangeLabel}
                  {w.isPartial && (
                    <span className="ml-1.5 text-xs text-black/40 dark:text-white/40">(so far)</span>
                  )}
                </td>
                {artists.map((a) => (
                  <td key={a.id} className="px-4 py-2 text-right tabular-nums">
                    {w.countsByArtist[a.id] ?? 0}
                  </td>
                ))}
                {weeks.some((x) => x.otherCount > 0) && (
                  <td className="px-4 py-2 text-right tabular-nums">{w.otherCount}</td>
                )}
                {weeks.some((x) => x.unattributedCount > 0) && (
                  <td className="px-4 py-2 text-right tabular-nums">{w.unattributedCount}</td>
                )}
                <td className="px-4 py-2 text-right tabular-nums font-medium">{weekTotal(w)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
