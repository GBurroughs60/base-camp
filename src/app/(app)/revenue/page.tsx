import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin";
import RevenueDashboard, {
  type LivePlayRow,
  type HistoricalYearRow,
} from "@/components/RevenueDashboard";
import AgentCommissions, { type AgentCommissionRow } from "@/components/AgentCommissions";
import { computePlayRevenue, type ArtistCommissionDefaults } from "@/lib/revenue";
import { listTeamMembers } from "@/app/actions/userProfiles";
import type { PlayStatus } from "@/lib/playStatus";

type PlayRecord = {
  id: string;
  artist_id: string | null;
  status: PlayStatus;
  show_date: string | null;
  guarantee_amount: number | null;
  gross_merch_sales: number | null;
  walkout_amount: number | null;
  management_commission_pct: number | null;
  booking_agent_commission_pct: number | null;
  booking_agent_user_id: string | null;
  artists: { name: string } | null;
};

type ArtistRecord = {
  id: string;
  name: string;
  photo_url: string | null;
  ridge_manages: boolean;
  ridge_books: boolean;
  management_commission_pct: number | null;
  booking_agent_commission_pct: number | null;
};

export default async function RevenuePage() {
  // Admin-only (2026-11-09, per Greg) -- see candidates/page.tsx's
  // identical comment; same reasoning, same src/lib/admin.ts helper.
  await requireAdmin();
  const supabase = await createClient();

  // Everything except declined/cancelled -- those deals never happened, so
  // they're not real revenue (live or historical) either way. Legacy IS
  // included here: it's excluded from Ridge's own live commission tracker
  // below, but it's exactly what feeds the historical by-year trend.
  const [{ data: playsData }, { data: artistsData }, teamMembers] = await Promise.all([
    supabase
      .from("plays")
      .select(
        "id, artist_id, status, show_date, guarantee_amount, gross_merch_sales, walkout_amount, management_commission_pct, booking_agent_commission_pct, booking_agent_user_id, artists(name)"
      )
      .not("status", "in", "(declined,cancelled)"),
    supabase
      .from("artists")
      .select(
        "id, name, photo_url, ridge_manages, ridge_books, management_commission_pct, booking_agent_commission_pct"
      ),
    listTeamMembers(),
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
        walkoutAmount: play.walkout_amount,
        managementCommissionPctOverride: play.management_commission_pct,
        bookingAgentCommissionPctOverride: play.booking_agent_commission_pct,
      },
      defaults
    );

    liveRows.push({
      ...result,
      artistName: artist.name,
      artistPhotoUrl: artist.photo_url,
      status: play.status,
      showDate: play.show_date,
    });
  }

  // -- Agent Commissions (docs/operations-accounting-plan.md section 11):
  // each internal booking agent's cut of Ridge's own booking commission,
  // not the management leg -- an agent's split is specifically of the
  // booking commission they personally earned Ridge, same scope as
  // plays.booking_agent_user_id's own comment. Reuses liveRows above
  // (same non-legacy, non-declined/cancelled scope, and the exact same
  // computePlayRevenue results -- no second pass of the commission math)
  // rather than recomputing, so there's only one place that logic lives.
  const agentIdByPlayId = new Map(plays.map((p) => [p.id, p.booking_agent_user_id]));
  const ridgeBooksByArtistId = new Map(artists.map((a) => [a.id, a.ridge_books]));
  const agentById = new Map(teamMembers.map((m) => [m.id, m]));
  const agentBuckets = new Map<
    string, // agent user id, or "" for unassigned
    { playCount: number; bookingCommissionTotal: number; hasUnknownBookingRate: boolean }
  >();
  for (const row of liveRows) {
    if (!ridgeBooksByArtistId.get(row.artistId)) continue;
    const key = agentIdByPlayId.get(row.playId) ?? "";
    const existing = agentBuckets.get(key) ?? {
      playCount: 0,
      bookingCommissionTotal: 0,
      hasUnknownBookingRate: false,
    };
    existing.playCount += 1;
    if (row.bookingCommission == null) {
      existing.hasUnknownBookingRate = true;
    } else {
      existing.bookingCommissionTotal += row.bookingCommission;
    }
    agentBuckets.set(key, existing);
  }

  const agentCommissionRows: AgentCommissionRow[] = Array.from(agentBuckets.entries())
    .map(([agentId, bucket]) => {
      const agent = agentId ? agentById.get(agentId) : null;
      const splitPct = agent?.bookingCommissionSplitPct ?? null;
      return {
        agentId: agentId || null,
        agentName: agent ? (agent.displayName ?? agent.email) : "Unassigned",
        playCount: bucket.playCount,
        bookingCommissionTotal: bucket.bookingCommissionTotal,
        hasUnknownBookingRate: bucket.hasUnknownBookingRate,
        splitPct,
        agentShare: splitPct != null ? bucket.bookingCommissionTotal * (splitPct / 100) : null,
      };
    })
    // Unassigned last regardless of its total, so it reads as a thing to
    // go fix rather than competing for the top spot by dollar amount.
    .sort((a, b) => {
      if (a.agentId === null) return 1;
      if (b.agentId === null) return -1;
      return b.bookingCommissionTotal - a.bookingCommissionTotal;
    });

  // -- Historical by-year trend: every play with a show, legacy or not. --
  const yearBuckets = new Map<
    string,
    {
      artistId: string;
      artistName: string;
      artistPhotoUrl: string | null;
      year: number | null;
      guaranteeTotal: number;
      guaranteeMerchTotal: number;
      playCount: number;
    }
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
      artistPhotoUrl: artist.photo_url,
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
        The Ridge&apos;s own booking/management commission, tracked from the plays Base Camp itself
        has created. Historical totals below include everything on file, including the legacy
        import.
      </p>

      <RevenueDashboard liveRows={liveRows} historicalRows={historicalRows} />

      <AgentCommissions rows={agentCommissionRows} />
    </div>
  );
}
