import { createClient } from "@/lib/supabase/server";
import RevenueDashboard, {
  type LivePlayRow,
  type HistoricalYearRow,
} from "@/components/RevenueDashboard";
import { computePlayRevenue, type ArtistCommissionDefaults } from "@/lib/revenue";
import type { PlayStatus } from "@/lib/playStatus";

type PlayRecord = {
  id: string;
  artist_id: string | null;
  status: PlayStatus;
  show_date: string | null;
  guarantee_amount: number | null;
  gross_merch_sales: number | null;
  management_commission_pct: number | null;
  booking_agent_commission_pct: number | null;
  artists: { name: string } | null;
};

type ArtistRecord = {
  id: string;
  name: string;
  ridge_manages: boolean;
  ridge_books: boolean;
  management_commission_pct: number | null;
  booking_agent_commission_pct: number | null;
};

export default async function RevenuePage() {
  const supabase = await createClient();

  // Everything except declined/cancelled -- those deals never happened, so
  // they're not real revenue (live or historical) either way. Legacy IS
  // included here: it's excluded from Ridge's own live commission tracker
  // below, but it's exactly what feeds the historical by-year trend.
  const [{ data: playsData }, { data: artistsData }] = await Promise.all([
    supabase
      .from("plays")
      .select(
        "id, artist_id, status, show_date, guarantee_amount, gross_merch_sales, management_commission_pct, booking_agent_commission_pct, artists(name)"
      )
      .not("status", "in", "(declined,cancelled)"),
    supabase
      .from("artists")
      .select(
        "id, name, ridge_manages, ridge_books, management_commission_pct, booking_agent_commission_pct"
      ),
  ]);

  const plays = (playsData ?? []) as unknown as PlayRecord[];
  const artists = (artistsData ?? []) as ArtistRecord[];
  const artistById = new Map(artists.map((a) => [a.id, a]));

  // -- Ridge's live revenue tracker: non-legacy plays only. --
  const liveRows: LivePlayRow[] = [];
  for (const play of plays) {
    if (play.status === "legacy" || !play.artist_id) continue;
    const artist = artistById.get(play.artist_id);
    if (!artist) continue;

    const defaults: ArtistCommissionDefaults = {
      id: artist.id,
      ridgeManages: artist.ridge_manages,
      ridgeBooks: artist.ridge_books,
      managementCommissionPct: artist.management_commission_pct,
      bookingAgentCommissionPct: artist.booking_agent_commission_pct,
    };

    const result = computePlayRevenue(
      {
        id: play.id,
        artistId: artist.id,
        status: play.status,
        guaranteeAmount: play.guarantee_amount,
        grossMerchSales: play.gross_merch_sales,
        managementCommissionPctOverride: play.management_commission_pct,
        bookingAgentCommissionPctOverride: play.booking_agent_commission_pct,
      },
      defaults
    );

    liveRows.push({
      ...result,
      artistName: artist.name,
      status: play.status,
      showDate: play.show_date,
    });
  }

  // -- Historical by-year trend: every play with a show, legacy or not. --
  const yearBuckets = new Map<
    string,
    { artistId: string; artistName: string; year: number | null; guaranteeTotal: number; guaranteeMerchTotal: number; playCount: number }
  >();
  for (const play of plays) {
    if (!play.artist_id) continue;
    const artist = artistById.get(play.artist_id);
    if (!artist) continue;

    const year = play.show_date ? new Date(play.show_date + "T00:00:00Z").getUTCFullYear() : null;
    const key = `${artist.id}:${year ?? "undated"}`;
    const existing = yearBuckets.get(key) ?? {
      artistId: artist.id,
      artistName: artist.name,
      year,
      guaranteeTotal: 0,
      guaranteeMerchTotal: 0,
      playCount: 0,
    };
    const guarantee = play.guarantee_amount ?? 0;
    const merch = play.gross_merch_sales ?? 0;
    existing.guaranteeTotal += guarantee;
    existing.guaranteeMerchTotal += guarantee + merch;
    existing.playCount += 1;
    yearBuckets.set(key, existing);
  }

  const historicalRows: HistoricalYearRow[] = Array.from(yearBuckets.values()).sort((a, b) => {
    if (a.artistName !== b.artistName) return a.artistName.localeCompare(b.artistName);
    // Undated last within each artist.
    if (a.year === null) return 1;
    if (b.year === null) return -1;
    return a.year - b.year;
  });

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Revenue</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        Ridge&apos;s own booking/management commission, tracked from the plays Base Camp itself
        has created. Historical totals below include everything on file, including the legacy
        import.
      </p>

      <RevenueDashboard liveRows={liveRows} historicalRows={historicalRows} />
    </div>
  );
}
