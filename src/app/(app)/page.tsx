import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";
import GlobalSearchBar from "@/components/GlobalSearchBar";


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

export default async function DashboardPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: artists },
    { data: upcoming },
    { data: recentPlays },
  ] = await Promise.all([
    supabase.from("artists").select("id, name").order("name"),
    supabase
      .from("plays")
      .select(
        "id, show_date, artists(name), venue:companies!plays_venue_id_fkey(id, name), events(id, name)"
      )
      .gte("show_date", today)
      .order("show_date", { ascending: true })
      .limit(8),
    supabase
      .from("plays")
      .select(
        "id, show_date, created_at, artists(name), venue:companies!plays_venue_id_fkey(id, name), events(id, name)"
      )
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  type UpcomingRow = {
    id: string;
    show_date: string | null;
    artists: { name: string } | null;
    venue: { id: string; name: string } | null;
    events: { id: string; name: string } | null;
  };

  const upcomingRows = (upcoming ?? []) as unknown as UpcomingRow[];
  const recentRows = (recentPlays ?? []) as unknown as (UpcomingRow & {
    created_at: string;
  })[];

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Dashboard</h1>
        <NewRecordButton />
      </div>
      <p className="italic text-black/60 dark:text-white/60 mb-6">
        Welcome back. Here&apos;s what&apos;s in Base Camp right now.
      </p>

      <div className="mb-8">
        <GlobalSearchBar />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-10">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Upcoming Shows
          </h2>
          {upcomingRows.length ? (
            <ul className="space-y-3">
              {upcomingRows.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link
                    href={`/plays/${p.id}`}
                    className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {formatDate(p.show_date)}
                  </Link>
                  <span className="text-black/70 dark:text-white/70">
                    {" "}
                    · {p.artists?.name ?? "Unbooked"}
                  </span>
                  <div className="text-black/50 dark:text-white/50">
                    {p.venue ? (
                      <Link
                        href={`/companies/${p.venue.id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {p.venue.name}
                      </Link>
                    ) : (
                      "No venue on file"
                    )}
                    {p.events && (
                      <>
                        {" "}
                        ·{" "}
                        <Link
                          href={`/events/${p.events.id}`}
                          className="hover:underline underline-offset-4"
                        >
                          {p.events.name}
                        </Link>
                      </>
                    )}
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
            <ul className="space-y-3">
              {recentRows.map((p) => (
                <li key={p.id} className="text-sm">
                  <Link
                    href={`/plays/${p.id}`}
                    className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {p.artists?.name ?? "Play"}
                    {p.show_date ? ` — ${formatDate(p.show_date)}` : ""}
                  </Link>
                  <div className="text-black/50 dark:text-white/50">
                    {p.venue?.name ?? "No venue on file"} · added{" "}
                    {timeAgo(p.created_at)}
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
        <ul className="flex flex-col gap-2">
          {artists?.map((artist) => (
            <li key={artist.id}>
              <Link
                href={`/artists/${artist.id}`}
                className="block border border-black/10 dark:border-white/10 rounded-lg px-4 py-3 bg-white dark:bg-neutral-900 text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {artist.name}
              </Link>
            </li>
          ))}
          {!artists?.length && (
            <p className="text-sm text-black/60 dark:text-white/60">
              No artists yet.
            </p>
          )}
        </ul>
      </div>
    </div>
  );
}
