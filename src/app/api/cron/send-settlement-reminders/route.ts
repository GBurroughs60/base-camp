import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendSettlementRequestEmail, sendSettlementEscalationEmail } from "@/lib/approvalEmail";
import { FALLBACK_NOTIFY_EMAIL } from "@/lib/constants";

// Daily job that nudges plays whose settlement report hasn't come in yet.
// A settlement-request email only ever fires once on its own (see
// advance-plays-to-played's sendSettlementEmails) -- without this, a play
// an artist simply forgot about just sits there forever with no report and
// no one the wiser until Greg happens to notice. This runs every day but
// only actually re-sends on roughly a REMINDER_INTERVAL_DAYS cadence per
// play (checked against settlement_last_reminder_sent_at, or
// settlement_email_sent_at for the first reminder) -- daily is just the
// polling interval, not the reminder cadence.
//
// After MAX_REMINDERS with still no report, this stops nudging the artist
// and escalates to Greg once (settlement_escalated_at) instead of emailing
// indefinitely forever with no end -- see sendSettlementEscalationEmail.
//
// Deliberately a separate route from advance-plays-to-played rather than
// folded into it -- reminders aren't related to advancing a play's status,
// they're their own concern with their own cadence, and keeping them apart
// means a failure in one never blocks the other.
//
// Triggered by Vercel Cron (see vercel.json), which sends
// `Authorization: Bearer $CRON_SECRET` automatically. A `?secret=` query
// param is also accepted for manual/local testing.

const REMINDER_INTERVAL_DAYS = 3;
const MAX_REMINDERS = 3;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed if not configured

  const authHeader = req.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // Candidates: a settlement request went out, nothing's come back yet,
  // and we haven't already given up on this one (escalated). Reminder-cap
  // and cadence are both checked in JS below rather than in this query --
  // simpler to read, and this table is small enough that it doesn't matter.
  const { data: plays, error } = await supabase
    .from("plays")
    .select(
      `id, show_date, guarantee_amount, venue_name, city, state, artist_id,
       settlement_token, settlement_email_sent_at, settlement_last_reminder_sent_at,
       settlement_reminder_count, settlement_escalated_at,
       artists(id, name),
       venue:companies!plays_venue_id_fkey(id, name, city, state)`
    )
    .eq("status", "played")
    .is("settlement_submitted_at", null)
    .not("settlement_email_sent_at", "is", null)
    .is("settlement_escalated_at", null);

  if (error) {
    console.error("send-settlement-reminders: candidate query failed", error);
    return NextResponse.json(
      { ok: false, error: "candidate query failed" },
      { status: 500 }
    );
  }

  let reminded = 0;
  let escalated = 0;

  for (const play of plays ?? []) {
    try {
      const artist = play.artists as unknown as { id: string; name: string } | null;
      if (!artist) continue;

      const gate = play.settlement_last_reminder_sent_at ?? play.settlement_email_sent_at;
      if (!gate || daysSince(gate) < REMINDER_INTERVAL_DAYS) continue;

      const venue = play.venue as unknown as
        | { id: string; name: string; city: string | null; state: string | null }
        | null;
      const venueLabel = venue?.name ?? play.venue_name ?? "Venue TBD";

      if (play.settlement_reminder_count >= MAX_REMINDERS) {
        await sendSettlementEscalationEmail({
          artistName: artist.name,
          venueLabel,
          showDate: play.show_date,
          reminderCount: play.settlement_reminder_count,
          playUrl: `https://base-camp-lovat.vercel.app/plays/${play.id}`,
        });
        await supabase
          .from("plays")
          .update({ settlement_escalated_at: new Date().toISOString() })
          .eq("id", play.id);
        escalated += 1;
        continue;
      }

      const [{ data: artistRows }, { data: managerRows }] = await Promise.all([
        supabase
          .from("contact_artists")
          .select("contacts(full_name, email)")
          .eq("artist_id", artist.id)
          .eq("role", "artist"),
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

      const usingFallback = artistRecipients.length === 0;
      const recipients = usingFallback
        ? [{ full_name: "Greg Burroughs", email: FALLBACK_NOTIFY_EMAIL }]
        : artistRecipients;

      const location =
        [venue?.city ?? play.city, venue?.state ?? play.state].filter(Boolean).join(", ") || null;

      // Reuses the original settlement_token rather than minting a new one
      // -- the link in every reminder points at the same /settle/[token]
      // page as the first email, since nothing about the token itself
      // expires or needs rotating.
      if (!play.settlement_token) continue;

      await sendSettlementRequestEmail({
        to: recipients.map((r) => r.email),
        cc: ccRecipients.map((r) => r.email),
        artistName: artist.name,
        venueLabel,
        location,
        showDate: play.show_date,
        guaranteeAmount: play.guarantee_amount,
        settleUrl: `https://base-camp-lovat.vercel.app/settle/${play.settlement_token}`,
        reminder: true,
        fallbackNote: usingFallback
          ? `No artist contact is on file for ${artist.name} -- add one on the artist's profile so future settlement requests route directly to them. You can still fill this one in from the play page in the meantime.`
          : undefined,
      });

      await supabase
        .from("plays")
        .update({
          settlement_last_reminder_sent_at: new Date().toISOString(),
          settlement_reminder_count: play.settlement_reminder_count + 1,
        })
        .eq("id", play.id);

      reminded += 1;
    } catch (err) {
      console.error(`send-settlement-reminders: failed for play ${play.id}`, err);
    }
  }

  return NextResponse.json({ ok: true, reminded, escalated });
}
