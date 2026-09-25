import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { sendEventsNeedingAttentionEmail, type NeedsAttentionEvent } from "@/lib/eventsNeedingAttentionEmail";

// Weekly "needs a manual touch" digest -- the follow-up Greg asked for
// after the SC import pilot surfaced that roughly a quarter of events can
// land with no usable date at all (no recurrence to infer from, or
// existence confirmed with no date given). Those sit outside catch-up and
// the standing cadence until something gives them a date, either the next
// Refresh pass or a human. This is that human path: a filtered view in the
// app (Events page, "Needs Date" pill) plus this weekly nudge so it
// doesn't require remembering to go look.
//
// Deliberately its own small cron/email rather than folded into
// scan-contacts' weekly digest -- different concern, different query, and
// keeping them separate means either can change independently. See
// eventsNeedingAttentionEmail.ts.
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

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServiceRoleClient();

  // events_needing_attention (see migration add_company_email_and_needs_date_view)
  // is `select e.*` from events, so it carries venue_id but not the venue's
  // name -- fetched separately below rather than relying on PostgREST
  // relationship embedding through a view, which isn't guaranteed to work
  // the way it does against the base table.
  const { data: needsAttention, error } = await supabase
    .from("events_needing_attention")
    .select("id, name, city, state, venue_id")
    .order("name");

  if (error) {
    console.error("events-needing-attention: failed to query view", error);
    return NextResponse.json({ ok: false, error: "query failed" }, { status: 500 });
  }

  const rows = needsAttention ?? [];
  const venueIds = Array.from(
    new Set(rows.map((r) => r.venue_id as string | null).filter((v): v is string => !!v))
  );

  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: venues } = await supabase.from("companies").select("id, name").in("id", venueIds);
    for (const v of venues ?? []) venueNameById.set(v.id as string, v.name as string);
  }

  const events: NeedsAttentionEvent[] = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string,
    city: r.city as string | null,
    state: r.state as string | null,
    venueName: r.venue_id ? (venueNameById.get(r.venue_id as string) ?? null) : null,
  }));

  await sendEventsNeedingAttentionEmail(events);

  return NextResponse.json({ ok: true, count: events.length });
}
