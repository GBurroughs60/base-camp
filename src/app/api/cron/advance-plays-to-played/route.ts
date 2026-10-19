import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

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

  const { data, error } = await supabase.rpc("advance_confirmed_plays_to_played");

  if (error) {
    console.error("advance-plays-to-played: rpc failed", error);
    return NextResponse.json(
      { ok: false, error: "advance_confirmed_plays_to_played rpc failed" },
      { status: 500 }
    );
  }

  const result = (data ?? {}) as { flipped?: number };

  return NextResponse.json({
    ok: true,
    flipped: result.flipped ?? 0,
  });
}
