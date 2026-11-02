import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { exchangeAuthorizationCode } from "@/lib/invoicing/quickbooks";

const STATE_COOKIE = "qbo_oauth_state";

// Intuit redirects back here after the user approves (or denies) access on
// its consent screen. Validates the CSRF state, exchanges the one-time
// code for a token pair, and replaces whatever's in quickbooks_connection
// (a singleton table) with the new connection -- a fresh authorization
// always means "this is the account to use from now on," possibly a
// different QBO company than whatever was connected before, so this
// replaces rather than tries to merge.
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const realmId = url.searchParams.get("realmId");
  const state = url.searchParams.get("state");
  const intuitError = url.searchParams.get("error");

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  if (intuitError) {
    return NextResponse.redirect(
      new URL(`/settings/quickbooks?error=${encodeURIComponent(intuitError)}`, req.url)
    );
  }
  if (!code || !realmId || !state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(new URL("/settings/quickbooks?error=invalid_state", req.url));
  }

  try {
    const redirectUri = new URL("/api/quickbooks/callback", req.url).toString();
    const tokens = await exchangeAuthorizationCode(code, redirectUri);

    const now = Date.now();
    const supabase = createServiceRoleClient();
    // Supabase's delete() requires a filter -- this is the standard idiom
    // for "delete every row" on a table whose primary key is a random
    // uuid (never equal to this fixed nil-uuid).
    await supabase.from("quickbooks_connection").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    const { error: insertError } = await supabase.from("quickbooks_connection").insert({
      realm_id: realmId,
      access_token: tokens.access_token,
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_token: tokens.refresh_token,
      refresh_token_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
    });
    if (insertError) throw new Error(insertError.message);

    return NextResponse.redirect(new URL("/settings/quickbooks?connected=1", req.url));
  } catch (err) {
    console.error("QuickBooks OAuth callback failed", err);
    return NextResponse.redirect(new URL("/settings/quickbooks?error=token_exchange_failed", req.url));
  }
}
