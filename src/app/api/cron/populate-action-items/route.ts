import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Daily population job for the Action List -- the in-app replacement for
// the old Gmail-draft Catch-up/Standing-Cadence engines. See
// docs/outreach-engine-plan.md section 2a for the full design.
//
// Deliberately a plain deterministic SQL job, not an agent session: no
// Gmail, no Drive, no LLM call. All the actual logic (supersede stale
// open rows, then insert this cycle's row per qualifying event) lives in
// the populate_action_items() Postgres function so it runs as a single
// atomic operation -- this route is just the auth wrapper and trigger.
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

  const { data, error } = await supabase.rpc("populate_action_items");

  if (error) {
    console.error("populate-action-items: rpc failed", error);
    return NextResponse.json({ ok: false, error: "populate_action_items rpc failed" }, { status: 500 });
  }

  const result = (data ?? {}) as { superseded?: number; inserted?: number };

  return NextResponse.json({
    ok: true,
    superseded: result.superseded ?? 0,
    inserted: result.inserted ?? 0,
  });
}
