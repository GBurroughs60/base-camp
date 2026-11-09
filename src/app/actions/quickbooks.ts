"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { disconnectConnection } from "@/lib/invoicing/quickbooks";

export type QuickBooksConnectionHealth = "connected" | "warning" | "disconnected";

export type QuickBooksConnectionStatus = {
  connected: boolean;
  realmId: string | null;
  connectedAt: string | null;
  accessTokenExpiresAt: string | null;
  refreshTokenExpiresAt: string | null;
  // Three-state read for the sidebar status light (and this page's own
  // badge): "connected" (healthy), "warning" (connected but the refresh
  // token -- not the access token -- is close to expiring), or
  // "disconnected" (no connection row at all). Deliberately NOT based on
  // access_token_expires_at: that token is refreshed lazily, only when an
  // API call is actually made (see getValidAccessToken in
  // lib/invoicing/quickbooks.ts), and at Ridge's invoice volume (a
  // handful a month) it sits "expired" between runs as a matter of
  // course -- using it here would show yellow almost all the time for no
  // real reason. The refresh token is the thing that actually matters:
  // Intuit documents ~100 days of life for it (rotated on every use, same
  // ~100-day window each time), and it only stops renewing if nothing
  // calls the API for that whole stretch or the connection gets revoked.
  // A shrinking window on it is a genuine, actionable signal.
  health: QuickBooksConnectionHealth;
};

// How far out from refresh-token expiry to start warning -- enough runway
// to reconnect before invoices actually start failing, short enough not
// to cry wolf for most of the token's ~100-day life.
const REFRESH_TOKEN_WARNING_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// quickbooks_connection deliberately carries zero RLS policies (see the
// add_quickbooks_invoicing_foundation migration) -- its rows are live OAuth
// credentials, equivalent to an API key, so the normal session client
// can't read it at all. This is the one narrow, read-only exception: the
// Settings page needs to know *whether* a connection exists, never the
// token values themselves, so this selects only non-secret columns and
// returns a status shape that has no room for a token to leak into even
// by accident.
export async function getQuickBooksConnectionStatus(): Promise<QuickBooksConnectionStatus> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quickbooks_connection")
    .select("realm_id, connected_at, access_token_expires_at, refresh_token_expires_at")
    .maybeSingle();
  if (error) {
    throw new Error(`Couldn't read QuickBooks connection status: ${error.message}`);
  }
  if (!data) {
    return {
      connected: false,
      realmId: null,
      connectedAt: null,
      accessTokenExpiresAt: null,
      refreshTokenExpiresAt: null,
      health: "disconnected",
    };
  }
  const refreshExpiresAt = new Date(data.refresh_token_expires_at).getTime();
  const health: QuickBooksConnectionHealth =
    refreshExpiresAt - REFRESH_TOKEN_WARNING_WINDOW_MS <= Date.now() ? "warning" : "connected";
  return {
    connected: true,
    realmId: data.realm_id,
    connectedAt: data.connected_at,
    accessTokenExpiresAt: data.access_token_expires_at,
    refreshTokenExpiresAt: data.refresh_token_expires_at,
    health,
  };
}

// Settings > QuickBooks's Disconnect button posts here. Revokes the token
// at Intuit and removes the stored connection, then redirects back to the
// same page (full navigation, same pattern as approval.ts/settlement.ts)
// so the page re-reads getQuickBooksConnectionStatus and shows "Not
// connected" rather than relying on client-side cache invalidation.
export async function disconnectQuickBooks(): Promise<void> {
  await disconnectConnection();
  redirect("/settings/quickbooks?disconnected=1");
}
