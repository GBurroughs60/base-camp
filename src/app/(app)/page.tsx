import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import GlobalSearchBar from "@/components/GlobalSearchBar";
import Avatar from "@/components/Avatar";
import { type PlayStatus, PLAY_STATUS_LABELS, PLAY_STATUS_BADGE_CLASSES } from "@/lib/playStatus";

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days <= 0) return "today";
  if (days === 1) return "1 day ago";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} mo ago`;
  return `${Math.floor(months / 12)} yr ago`;
}

type PlayRow = {
  id: string;
  show_date: string | null;
  status: PlayStatus;
  artists: { name: string; photo_url: string | null } | null;
  venue: { id: string; name: string } | null;
  venue_name: string | null;
  events: { id: string; name: string } | null;
};

// Venue if there is one, the Event if there isn't (an event on file is
// real information -- "No venue on file" by itself isn't), both if both
// exist, and the plain fallback only when neither does. Per Greg
// (2026-11-10): the old version always said "No venue on file" whenever
// venue_id was empty, even when the play *did* have an event attached.
//
// Per Greg (2026-11-10, round 2): that first fix still missed one case --
// a play can have a venue_name (raw text, same as the Plays list's
// "needs match" column) with no venue_id, because it was never linked to
// an actual venue record. That's a venue on file, just an unmatched one,
// so it shouldn't fall all the way to "No venue on file" either. Mirrors
// the Plays list's own needs-match treatment.
function PlayLocation({ play }: { play: PlayRow }) {
  if (!play.venue && !play.venue_name && !play.events) {
    return <span>No venue on file</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {play.venue ? (
        <Link href={`/companies/${play.venue.id}`} className="hover:underline underline-offset-4">
          {play.venue.name}
        </Link>
      ) : (
        play.venue_name && (
          <Link
            href={`/plays/${play.id}`}
            className="inline-flex items-center gap-1.5 hover:underline underline-offset-4"
            title="No matching venue found — needs review"
          >
            <span>{play.venue_name}</span>
            <span className="text-[10px] leading-none px-1.5 py-1 rounded-full border border-amber-400/60 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 whitespace-nowrap">
              needs match
            </span>
          </Link>
        )
      )}
      {(play.venue || play.venue_name) && play.events && <span>·</span>}
      {play.events && (
        <Link href={`/events/${play.events.id}`} className="hover:underline underline-offset-4">
          {play.events.name}
        </Link>
      )}
    </span>
  );
}

function StatusBadge({ status }: { status: PlayStatus }) {
  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${
        PLAY_STATUS_BADGE_CLASSES[status] ?? ""
      }`}
    >
      {PLAY_STATUS_LABELS[status] ?? status}
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 px-4 py-3">
      <p className="text-xs font-medium text-black/50 dark:text-white/50">{label}</p>
      <p className="text-2xl font-display font-medium mt-1">{value}</p>
      <p className="text-xs text-black/50 dark:text-white/50 mt-1">{sub}</p>
    </div>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const thisYear = now.getFullYear();
  const lastYear = thisYear - 1;
  const nextYear = thisYear + 1;
  const startOfThisYear = `${thisYear}-01-01`;
  const startOfLastYear = `${lastYear}-01-01`;
  // Same month/day cutoff, one year back -- "as of the same point in the
  // calendar" rather than the full prior year, so the comparison is apples
  // to apples regardless of how far into the current year we are.
  const sameDayLastYear = new Date(lastYear, now.getMonth(), now.getDate())
    .toISOString()
    .slice(0, 10);
  const startOfNextYear = `${nextYear}-01-01`;
  const endOfNextYear = `${nextYear}-12-31`;

  const [
    { data: artists },
    { data: upcoming },
    { data: recentPlays },
    { count: showsThisMonthCount },
    { count: bookedMtdCount },
    { count: showsYtdCount },
    { count: showsYtdLastYearCount },
    { count: nextYearBookedCount },
  ] = await Promise.all([
    supabase
      .from("artists")
      .select("id, name, photo_url")
      .eq("archived", false)
      .order("name"),
    supabase
      .from("plays")
      .select(
        "id, show_date, status, venue_name, artists(name, photo_url), venue:companies!plays_venue_id_fkey(id, name), events(id, name)"
      )
      .gte("show_date", today)
      .order("show_date", { ascending: true })
      .limit(8),
    supabase
      .from("plays")
      .select(
        "id, show_date, status, created_at, venue_name, artists(name, photo_url), venue:companies!plays_venue_id_fkey(id, name), events(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(6),
    // Remaining shows on the calendar this month -- "upcoming" and "this
    // month" both apply, so the lower bound is today, not the 1st.
    supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .gte("show_date", today)
      .lte("show_date", endOfMonth),
    // Booking *pace*, not show dates -- plays created this calendar month
    // so far, regardless of when the show itself happens. A different
    // question from the tile above on purpose: one is "what's coming up,"
    // the other is "how much are we closing lately."
    supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .gte("created_at", startOfMonth.toISOString()),
    // Shows booked this year, to date -- show-date based (not created_at),
    // so legacy/bulk-imported rows count correctly by when the show
    // actually is, not when the row was entered. Declined/cancelled are
    // excluded, same "never actually happened" rule as Revenue. Bounded by
    // today, not the full year, so the YoY comparison below is a fair,
    // same-point-in-the-calendar read rather than comparing a partial year
    // to a complete one.
    supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .gte("show_date", startOfThisYear)
      .lte("show_date", today)
      .not("status", "in", "(declined,cancelled)"),
    supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .gte("show_date", startOfLastYear)
      .lte("show_date", sameDayLastYear)
      .not("status", "in", "(declined,cancelled)"),
    // Advance bookings for next year -- every play with a show_date out
    // that far has, by definition, already been booked, so this doesn't
    // need a created_at cutoff the way the pace metrics above do. Per
    // Greg (2026-11-10): no YoY comparison here yet -- that would mean
    // knowing how many 2026 shows were already on file this time last
    // year, which needs real created_at history, and Base Camp's own
    // pipeline tracking (as opposed to the one-time legacy import) has
    // only been live a couple of months. Revisit once there's a real
    // year of usage to compare against.
    supabase
      .from("plays")
      .select("*", { count: "exact", head: true })
      .gte("show_date", startOfNextYear)
      .lte("show_date", endOfNextYear)
      .not("status", "in", "(declined,cancelled)"),
  ]);

  const upcomingRows = (upcoming ?? []) as unknown as PlayRow[];
  const recentRows = (recentPlays ?? []) as unknown as (PlayRow & { created_at: string })[];

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Dashboard</h1>
      <p className="italic text-black/60 dark:text-white/60 mb-6">
        Welcome back. Here&apos;s what&apos;s in Base Camp right now.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex-1 min-w-[200px]">
          <GlobalSearchBar />
        </div>
        <NewRecordButton />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8 max-w-3xl">
        <StatTile
          label="Shows This Month"
          value={showsThisMonthCount ?? 0}
          sub="remaining on the calendar"
        />
        <StatTile
          label="Booked Month-to-Date"
          value={bookedMtdCount ?? 0}
          sub="new plays added this month"
        />
        <StatTile
          label={`Shows Booked — ${thisYear} YTD`}
          value={showsYtdCount ?? 0}
          sub={`vs ${showsYtdLastYearCount ?? 0} this time last year`}
        />
        <StatTile
          label={`Booked for ${nextYear}`}
          value={nextYearBookedCount ?? 0}
          sub="already on next year's calendar"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Upcoming Shows
          </h2>
          {upcomingRows.length ? (
            <ul className="flex flex-col">
              {upcomingRows.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] transition-colors"
                >
                  <Avatar src={p.artists?.photo_url} name={p.artists?.name ?? "?"} size={36} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/plays/${p.id}`}
                        className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                      >
                        {formatDate(p.show_date)}
                      </Link>
                      <span className="text-black/70 dark:text-white/70">
                        {p.artists?.name ?? "Unbooked"}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-black/50 dark:text-white/50 mt-0.5">
                      <PlayLocation play={p} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No upcoming shows on the calendar.
            </p>
          )}
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Recently Added
          </h2>
          {recentRows.length ? (
            <ul className="flex flex-col">
              {recentRows.map((p) => (
                <li
                  key={p.id}
                  className="flex items-start gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-black/[.03] dark:hover:bg-white/[.04] transition-colors"
                >
                  <Avatar src={p.artists?.photo_url} name={p.artists?.name ?? "?"} size={36} />
                  <div className="min-w-0 flex-1 text-sm">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/plays/${p.id}`}
                        className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                      >
                        {p.artists?.name ?? "Play"}
                        {p.show_date ? ` — ${formatDate(p.show_date)}` : ""}
                      </Link>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-black/50 dark:text-white/50 mt-0.5">
                      <PlayLocation play={p} /> · added {timeAgo(p.created_at)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              Nothing added recently.
            </p>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-3">Artists / Roster</h2>
        {artists?.length ? (
          <div className="flex flex-wrap gap-4">
            {artists.map((artist) => (
              <Link
                key={artist.id}
                href={`/artists/${artist.id}`}
                className="group flex flex-col items-center gap-2 w-20 text-center"
              >
                <Avatar
                  src={artist.photo_url}
                  name={artist.name}
                  size={72}
                  className="ring-1 ring-black/10 dark:ring-white/10 group-hover:ring-2 group-hover:ring-ridge-orange/60 transition-shadow"
                />
                <span className="text-xs text-black/70 dark:text-white/70 group-hover:text-ridge-orange-dark dark:group-hover:text-ridge-orange leading-tight line-clamp-2">
                  {artist.name}
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/60">No artists yet.</p>
        )}
      </div>
    </div>
  );
}
