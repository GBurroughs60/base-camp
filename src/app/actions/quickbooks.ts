"use server";

import { redirect } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { disconnectConnection } from "@/lib/invoicing/quickbooks";

export type QuickBooksConnectionStatus = {
  connected: boolean;
  realmId: string | null;
  connectedAt: string | null;
  accessTokenExpiresAt: string | null;
};

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
    .select("realm_id, connected_at, access_token_expires_at")
    .maybeSingle();
  if (error) {
    throw new Error(`Couldn't read QuickBooks connection status: ${error.message}`);
  }
  if (!data) {
    return { connected: false, realmId: null, connectedAt: null, accessTokenExpiresAt: null };
  }
  return {
    connected: true,
    realmId: data.realm_id,
    connectedAt: data.connected_at,
    accessTokenExpiresAt: data.access_token_expires_at,
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
