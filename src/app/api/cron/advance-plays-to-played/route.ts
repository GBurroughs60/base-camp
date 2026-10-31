import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendSettlementRequestEmail } from "@/lib/approvalEmail";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Daily job that advances a play from 'confirmed' to 'played' once its
// show_date has passed, so the Kanban board (and the revenue tracker
// reading off the same status) reflects reality without anyone having to
// manually drag the card. 'settled' is deliberately left out -- that step
// stays a manual call for now. See docs/outreach-engine-plan.md's
// financial reporting section for the Booked -> Earned -> Settled design
// this feeds.
//
// Deliberately a plain deterministic SQL job, not an agent session --
// same shape as populate-action-items: all the logic lives in the
// advance_confirmed_plays_to_played() Postgres function, this route is
// just the auth wrapper and trigger.
//
// This is also where the settlement-request email fires (see
// sendSettlementEmails below) -- deliberately *not* wired into
// updateField/sendApprovalEmailIfNeeded in records.ts, since a play can
// reach "played" in bulk via this cron rather than through a single
// UI-initiated status edit, and sendApprovalEmailIfNeeded only ever runs
// for the one play a person just edited. Querying "played with no
// settlement email sent yet" after the RPC runs, rather than threading
// play ids out of advance_confirmed_plays_to_played()'s return value, also
// catches any play that reached "played" some other way (e.g. a manual
// board drag) without needing a second code path.
//
// Triggered by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=` query
// param is also accepted for manual/local testing.

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

// Fires the "how did it go?" settlement-request email for every play
// that's sitting in "played" without one yet, minting a fresh
// settlement_token per play the same way sendApprovalEmailIfNeeded mints
// approval_token in records.ts -- generated server-side only, stored
// alongside settlement_email_sent_at in the same write. Best-effort per
// play: one play's email failure (or a play with no artist/venue data to
// build the email from) is logged and skipped rather than aborting the
// whole batch.
async function sendSettlementEmails(
  supabase: ReturnType<typeof createServiceRoleClient>
): Promise<{ emailed: number }> {
  const { data: plays, error } = await supabase
    .from("plays")
    .select(
      `id, show_date, guarantee_amount, venue_name, city, state, artist_id,
       artists(id, name),
       venue:companies!plays_venue_id_fkey(id, name, city, state)`
    )
    .eq("status", "played")
    .is("settlement_email_sent_at", null);

  if (error) {
    console.error("advance-plays-to-played: settlement-candidate query failed", error);
    return { emailed: 0 };
  }

  let emailed = 0;

  for (const play of plays ?? []) {
    try {
      const artist = play.artists as unknown as { id: string; name: string } | null;
      if (!artist) continue;

      const [{ data: artistRows }, { data: managerRows }] = await Promise.all([
        supabase
          .from("contact_artists")
          .select("contacts(full_name, email)")
          .eq("artist_id", artist.id)
          .eq("role", "artist"),
        // Management is cc'd, not primary -- Greg's instruction was explicit
        // that the artist on the play should be the one filling out the
        // form, with management kept in the loop rather than owning it.
        supabase
          .from("contact_artists")
          .select("contacts(full_name, email)")
          .eq("artist_id", artist.id)
          .eq("role", "manager"),
      ]);

      const artistRecipients = (artistRows ?? [])
        .map((row) => row.contacts as unknown as { full_name: string; email: string | null } | null)
        .filter((c): c is { full_name: string; email: string } => !!c?.email);

      const ccRecipients = (managerRows ?? [])
        .map((row) => row.contacts as unknown as { full_name: string; email: string | null } | null)
        .filter((c): c is { full_name: string; email: string } => !!c?.email);

      // No artist contact on file (or none with an email) -- fall back to
      // Greg directly, same convention as every other automated
      // notification in this app. A settlement request must never just sit
      // unsent because an artist profile is missing a contact.
      const usingFallback = artistRecipients.length === 0;
      const recipients = usingFallback
        ? [{ full_name: "Greg Burroughs", email: FALLBACK_NOTIFY_EMAIL }]
        : artistRecipients;

      const venue = play.venue as unknown as
        | { id: string; name: string; city: string | null; state: string | null }
        | null;
      const venueLabel = venue?.name ?? play.venue_name ?? "Venue TBD";
      const location =
        [venue?.city ?? play.city, venue?.state ?? play.state].filter(Boolean).join(", ") || null;

      const settlementToken = crypto.randomUUID();

      await sendSettlementRequestEmail({
        to: recipients.map((r) => r.email),
        cc: ccRecipients.map((r) => r.email),
        artistName: artist.name,
        venueLabel,
        location,
        showDate: play.show_date,
        guaranteeAmount: play.guarantee_amount,
        settleUrl: `https://base-camp-lovat.vercel.app/settle/${settlementToken}`,
        fallbackNote: usingFallback
          ? `No artist contact is on file for ${artist.name} -- add one on the artist's profile so future settlement requests route directly to them. You can still fill this one in from the play page in the meantime.`
          : undefined,
      });

      await supabase
        .from("plays")
        .update({
          settlement_email_sent_at: new Date().toISOString(),
          settlement_token: settlementToken,
        })
        .eq("id", play.id);

      emailed += 1;
    } catch (err) {
      console.error(`advance-plays-to-played: settlement email failed for play ${play.id}`, err);
    }
  }

  return { emailed };
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase.rpc("advance_confirmed_plays_to_played");

  if (error) {
    console.error("advance-plays-to-played: rpc failed", error);
    return NextResponse.json(
      { ok: false, error: "advance_confirmed_plays_to_played rpc failed" },
      { status: 500 }
    );
  }

  const result = (data ?? {}) as { flipped?: number };

  const { emailed } = await sendSettlementEmails(supabase);

  return NextResponse.json({
    ok: true,
    flipped: result.flipped ?? 0,
    settlementEmailed: emailed,
  });
}
