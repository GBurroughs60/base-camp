import type { PlayStatus } from "@/lib/playStatus";

// Ridge's own revenue tracker -- distinct from an artist's gross earnings.
// See docs/outreach-engine-plan.md's financial reporting section for the
// full design history (Greg, 2026-10-17 onward).
//
// Scope: only plays created through Base Camp itself count toward Ridge's
// revenue number (status !== 'legacy'). The 555 legacy rows imported from
// the old spreadsheet are real historical artist earnings, but predate
// Ridge's own commission tracking here -- they feed the separate
// historical-by-year trend instead (computed directly in the revenue page,
// not here, since it's a plain SQL-shaped aggregate with no commission
// math involved).

export type RevenueStage = "booked" | "earned" | "settled";

// Every status in the live pipeline up through (and including) 'confirmed'
// counts as Booked/Projected. 'played' is Earned -- the auto-flip cron
// (advance_confirmed_plays_to_played) moves a play here the day after its
// show_date passes. 'settled' stays a manual Kanban-board move for now,
// and is the natural home for a future invoice/collection flag.
// 'legacy', 'declined', and 'cancelled' are excluded from this tracker
// entirely -- legacy predates it, and a declined/cancelled deal was never
// real revenue to begin with.
const BOOKED_STATUSES: ReadonlySet<PlayStatus> = new Set([
  "offer_submitted",
  "pending_agent_approval",
  "pending_approval",
  "contract_sent",
  "confirmed",
]);

export function revenueStageForStatus(status: PlayStatus): RevenueStage | null {
  if (BOOKED_STATUSES.has(status)) return "booked";
  if (status === "played") return "earned";
  if (status === "settled") return "settled";
  return null;
}

export type CommissionPlayInput = {
  id: string;
  artistId: string;
  status: PlayStatus;
  guaranteeAmount: number | null;
  grossMerchSales: number | null;
  // Play-level overrides -- whole-number percentages (10 means 10%), same
  // convention as the artist-level defaults they fall back to. Never the
  // legacy band_percentage decimal-fraction convention.
  managementCommissionPctOverride: number | null;
  bookingAgentCommissionPctOverride: number | null;
};

export type ArtistCommissionDefaults = {
  id: string;
  ridgeManages: boolean;
  ridgeBooks: boolean;
  managementCommissionPct: number | null;
  bookingAgentCommissionPct: number | null;
};

export type PlayRevenueResult = {
  playId: string;
  artistId: string;
  stage: RevenueStage | null;
  guaranteeAmount: number | null;
  // Each leg is null (not 0) when that leg applies (ridge_books /
  // ridge_manages) but no rate exists anywhere -- play override and
  // artist default are both blank. Never silently treated as a zero
  // commission; see missingBookingRate/missingManagementRate.
  bookingCommission: number | null;
  managementCommission: number | null;
  // The sum of whichever legs ARE known. A missing leg contributes
  // nothing here (never guessed as zero), but it no longer blanks out a
  // *different* leg that IS known -- see missingBookingRate/
  // missingManagementRate below for which leg (if any) is still a gap.
  // Per Greg (2026-10-20, re: Brittany Elise's booking commission being
  // hidden by her still-unmodeled flat-fee management retainer): "add
  // the booking commission... even though her management commission is
  // different." A play with both legs missing simply totals $0 here,
  // same as a play that doesn't apply to either leg at all.
  totalRidgeRevenue: number;
  missingBookingRate: boolean;
  missingManagementRate: boolean;
  missingGuaranteeAmount: boolean;
};

/**
 * Computes Ridge's own commission revenue for one play. Booking commission
 * is based on the guarantee only (merch excluded) -- a booking agent's cut
 * is conventionally of the deal, not the merch table. Management
 * commission (only for artists Ridge manages) is based on guarantee PLUS
 * merch, since a manager's commission conventionally covers everything the
 * artist earns from the show.
 *
 * A play-level commission percentage always overrides the artist's
 * default when present; when neither is present and that commission type
 * applies to this artist, that leg is flagged missing rather than assumed
 * to be zero (per Greg, 2026-10-17: "never assume blank equals zero").
 * A missing leg withholds only its OWN commission from the total, never a
 * different leg that's already known (per Greg, 2026-10-20) -- callers
 * should still surface missingBookingRate/missingManagementRate (e.g. a
 * warning banner) so a partial total is never mistaken for a complete one.
 */
export function computePlayRevenue(
  play: CommissionPlayInput,
  artist: ArtistCommissionDefaults
): PlayRevenueResult {
  const stage = revenueStageForStatus(play.status);
  const missingGuaranteeAmount = play.guaranteeAmount == null;

  let bookingCommission: number | null = 0;
  let missingBookingRate = false;
  if (artist.ridgeBooks) {
    const pct = play.bookingAgentCommissionPctOverride ?? artist.bookingAgentCommissionPct;
    if (pct == null) {
      bookingCommission = null;
      missingBookingRate = true;
    } else {
      bookingCommission = (play.guaranteeAmount ?? 0) * (pct / 100);
    }
  }

  let managementCommission: number | null = 0;
  let missingManagementRate = false;
  if (artist.ridgeManages) {
    const pct = play.managementCommissionPctOverride ?? artist.managementCommissionPct;
    if (pct == null) {
      managementCommission = null;
      missingManagementRate = true;
    } else {
      const basis = (play.guaranteeAmount ?? 0) + (play.grossMerchSales ?? 0);
      managementCommission = basis * (pct / 100);
    }
  }

  const totalRidgeRevenue = (bookingCommission ?? 0) + (managementCommission ?? 0);

  return {
    playId: play.id,
    artistId: play.artistId,
    stage,
    guaranteeAmount: play.guaranteeAmount,
    bookingCommission,
    managementCommission,
    totalRidgeRevenue,
    missingBookingRate,
    missingManagementRate,
    missingGuaranteeAmount,
  };
}

/** Gross value to the artist (guarantee + merch) -- no commission applied. */
export function artistGrossRevenue(play: {
  guaranteeAmount: number | null;
  grossMerchSales: number | null;
}): number {
  return (play.guaranteeAmount ?? 0) + (play.grossMerchSales ?? 0);
}

export type RevenueTotals = {
  booked: { total: number; count: number };
  earned: { total: number; count: number };
  settled: { total: number; count: number };
  missingRate: { count: number; guaranteeTotal: number };
};

export function aggregateRevenue(results: PlayRevenueResult[]): RevenueTotals {
  const totals: RevenueTotals = {
    booked: { total: 0, count: 0 },
    earned: { total: 0, count: 0 },
    settled: { total: 0, count: 0 },
    missingRate: { count: 0, guaranteeTotal: 0 },
  };

  for (const r of results) {
    // Informational only now -- a partial row's known leg still counts
    // toward its stage total below (see computePlayRevenue); this tally
    // just tracks how many rows/dollars have a gap worth flagging.
    if (r.missingBookingRate || r.missingManagementRate) {
      totals.missingRate.count += 1;
      totals.missingRate.guaranteeTotal += r.guaranteeAmount ?? 0;
    }
    if (r.stage === "booked") {
      totals.booked.total += r.totalRidgeRevenue;
      totals.booked.count += 1;
    } else if (r.stage === "earned") {
      totals.earned.total += r.totalRidgeRevenue;
      totals.earned.count += 1;
    } else if (r.stage === "settled") {
      totals.settled.total += r.totalRidgeRevenue;
      totals.settled.count += 1;
    }
  }

  return totals;
}
