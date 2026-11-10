import crypto from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type {
  CreateInvoiceInput,
  CreateInvoiceResult,
  InvoiceState,
  InvoicingProvider,
  NormalizedInvoiceEvent,
} from "./types";

// NEEDS LIVE VERIFICATION, same spirit as signature/signwell.ts's own
// header comment: everything below traces to a specific documented QBO
// Accounting API v3 / OAuth2 endpoint or field, but none of it has run
// against a real account yet -- there is no QBO account to run it against
// until Greg finishes signing up and registering a developer app (see
// docs/operations-accounting-plan.md section 3). Treat this file as
// "should be right" rather than "confirmed right" until that first live
// test, which is also when the one-time Item setup note below gets
// resolved for real.

const ENVIRONMENT = process.env.QUICKBOOKS_ENVIRONMENT === "production" ? "production" : "sandbox";
const API_BASE =
  ENVIRONMENT === "production"
    ? "https://quickbooks.api.intuit.com/v3/company"
    : "https://sandbox-quickbooks.api.intuit.com/v3/company";
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const REVOKE_ENDPOINT = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

// The commission-invoice line needs a QBO "Item" (a product/service) to
// reference -- QBO's data model requires it, Base Camp has no equivalent
// concept. Deliberately *not* auto-created the way a Customer is below:
// creating a Customer per artist is a safe 1:1 mirror of something Base
// Camp already models, but an Item is an accounting-chart-of-accounts
// decision (which income account it posts to, etc.) that Greg should set
// up once in QBO itself, not have silently created by this code the first
// time an invoice goes out. If this name isn't found, createInvoice throws
// a clear error rather than guessing.
const COMMISSION_ITEM_NAME = process.env.QUICKBOOKS_COMMISSION_ITEM_NAME ?? "Booking Commission";

// Intuit's own support/debugging convention: every QBO API and OAuth
// response carries an `intuit_tid` header, and Intuit support asks for it
// when diagnosing a failed call -- it's useless after the fact if it was
// never captured. Folded into the thrown error message (rather than a
// separate log call) so it travels with the error wherever it surfaces
// (webhook route logs, Vercel runtime logs, a future error-tracking tool)
// instead of needing its own plumbing.
function describeFailedResponse(prefix: string, res: Response, body: string, extra?: string): Error {
  const tid = res.headers.get("intuit_tid");
  const tidSuffix = tid ? ` [intuit_tid: ${tid}]` : "";
  const extraSuffix = extra ? ` -- ${extra}` : "";
  return new Error(`${prefix} (${res.status}): ${body}${tidSuffix}${extraSuffix}`);
}

function clientCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      "QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET are not set -- register a developer app at developer.intuit.com first."
    );
  }
  return { clientId, clientSecret };
}

type ConnectionRow = {
  id: string;
  realm_id: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
};

async function getConnection(): Promise<ConnectionRow> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quickbooks_connection")
    .select("id, realm_id, access_token, access_token_expires_at, refresh_token, refresh_token_expires_at")
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the QuickBooks connection: ${error.message}`);
  if (!data) {
    throw new Error(
      "QuickBooks isn't connected yet -- visit Settings > QuickBooks and connect the account first."
    );
  }
  return data as ConnectionRow;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number; // seconds, documented default 3600
  x_refresh_token_expires_in: number; // seconds, documented default ~8726400 (101 days)
};

// Exchanges an authorization code for the first token pair -- called once,
// from the OAuth callback route, never from here otherwise.
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const { clientId, clientSecret } = clientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw describeFailedResponse("QuickBooks token exchange failed", res, body);
  }
  return (await res.json()) as TokenResponse;
}

// Refreshes and persists a new token pair. Intuit *rotates* the refresh
// token on every use -- the one just spent stops working immediately --
// so the new one must be saved right away, not just the new access token.
// KNOWN EDGE CASE, not handled: two near-simultaneous calls could both read
// the same still-valid-looking row and both attempt to refresh with the
// same (about-to-be-spent) refresh_token; only the first would succeed.
// Not worth a locking mechanism at Ridge's actual invoice volume (a
// handful a month) -- noted rather than silently ignored.
async function refreshAccessToken(connection: ConnectionRow): Promise<string> {
  const { clientId, clientSecret } = clientCredentials();
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw describeFailedResponse(
      "QuickBooks token refresh failed",
      res,
      body,
      "the connection may need to be re-authorized from Settings > QuickBooks."
    );
  }
  const tokens = (await res.json()) as TokenResponse;

  const now = Date.now();
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("quickbooks_connection")
    .update({
      access_token: tokens.access_token,
      access_token_expires_at: new Date(now + tokens.expires_in * 1000).toISOString(),
      refresh_token: tokens.refresh_token,
      refresh_token_expires_at: new Date(now + tokens.x_refresh_token_expires_in * 1000).toISOString(),
      updated_at: new Date(now).toISOString(),
    })
    .eq("id", connection.id);
  if (error) throw new Error(`Couldn't save the refreshed QuickBooks token: ${error.message}`);

  return tokens.access_token;
}

// Revokes the stored OAuth token at Intuit and forgets the connection
// locally -- the Disconnect button on Settings > QuickBooks, and the only
// caller. Exists because Intuit's production-keys checklist requires a
// working disconnect flow, not just a connect one, and because leaving a
// revoked-at-Intuit's-end token sitting in quickbooks_connection would
// make Base Camp think it's still connected when it isn't. Revoking is
// best-effort: if Intuit's endpoint errors or the token's already invalid
// there, the local row is deleted regardless -- a connection Base Camp
// still thinks is live is the worse failure mode of the two.
export async function disconnectConnection(): Promise<{ wasConnected: boolean }> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("quickbooks_connection")
    .select("id, refresh_token")
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the QuickBooks connection: ${error.message}`);
  if (!data) return { wasConnected: false };

  try {
    const { clientId, clientSecret } = clientCredentials();
    await fetch(REVOKE_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ token: data.refresh_token }),
    });
  } catch {
    // Best-effort -- see comment above.
  }

  const { error: deleteError } = await supabase
    .from("quickbooks_connection")
    .delete()
    .eq("id", data.id);
  if (deleteError) throw new Error(`Couldn't remove the QuickBooks connection: ${deleteError.message}`);
  return { wasConnected: true };
}

// 2-minute buffer before the documented expiry, so a token that's valid
// when checked doesn't expire mid-request.
const EXPIRY_BUFFER_MS = 2 * 60 * 1000;

async function getValidAccessToken(): Promise<{ accessToken: string; realmId: string }> {
  const connection = await getConnection();
  const expiresAt = new Date(connection.access_token_expires_at).getTime();
  if (expiresAt - EXPIRY_BUFFER_MS > Date.now()) {
    return { accessToken: connection.access_token, realmId: connection.realm_id };
  }
  const accessToken = await refreshAccessToken(connection);
  return { accessToken, realmId: connection.realm_id };
}

async function qboFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { accessToken, realmId } = await getValidAccessToken();
  return fetch(`${API_BASE}/${realmId}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...init.headers,
    },
  });
}

// QBO's query language needs its string literals escaped (single quotes
// doubled) -- the same shape as SQL, since it's deliberately SQL-like.
function qboQueryEscape(s: string): string {
  return s.replace(/'/g, "''");
}

type QboQueryResponse<T> = { QueryResponse: Record<string, T[] | undefined> };

async function findOrCreateCustomer(name: string, email: string): Promise<string> {
  const query = `select * from Customer where DisplayName = '${qboQueryEscape(name)}'`;
  const res = await qboFetch(`/query?query=${encodeURIComponent(query)}&minorversion=65`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw describeFailedResponse("QuickBooks Customer query failed", res, body);
  }
  const data = (await res.json()) as QboQueryResponse<{ Id: string }>;
  const existing = data.QueryResponse.Customer?.[0];
  if (existing) return existing.Id;

  const createRes = await qboFetch("/customer", {
    method: "POST",
    body: JSON.stringify({
      DisplayName: name,
      PrimaryEmailAddr: { Address: email },
    }),
  });
  if (!createRes.ok) {
    const body = await createRes.text().catch(() => "");
    throw describeFailedResponse("QuickBooks Customer create failed", createRes, body);
  }
  const created = (await createRes.json()) as { Customer: { Id: string } };
  return created.Customer.Id;
}

async function findCommissionItemId(): Promise<string> {
  const query = `select * from Item where Name = '${qboQueryEscape(COMMISSION_ITEM_NAME)}'`;
  const res = await qboFetch(`/query?query=${encodeURIComponent(query)}&minorversion=65`);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw describeFailedResponse("QuickBooks Item query failed", res, body);
  }
  const data = (await res.json()) as QboQueryResponse<{ Id: string }>;
  const item = data.QueryResponse.Item?.[0];
  if (!item) {
    throw new Error(
      `No QuickBooks Item named "${COMMISSION_ITEM_NAME}" exists -- create one in QBO first (Sales > Products and Services), or set QUICKBOOKS_COMMISSION_ITEM_NAME to an existing Item's name.`
    );
  }
  return item.Id;
}

export class QuickBooksProvider implements InvoicingProvider {
  readonly name = "quickbooks";

  async createInvoice(input: CreateInvoiceInput): Promise<CreateInvoiceResult> {
    const customerId =
      input.existingProviderCustomerId ??
      (await findOrCreateCustomer(input.customer.name, input.customer.email));

    const itemId = await findCommissionItemId();

    const res = await qboFetch("/invoice", {
      method: "POST",
      body: JSON.stringify({
        CustomerRef: { value: customerId },
        Line: [
          {
            Amount: input.amount,
            DetailType: "SalesItemLineDetail",
            Description: input.description,
            SalesItemLineDetail: {
              ItemRef: { value: itemId, name: COMMISSION_ITEM_NAME },
              Qty: 1,
              UnitPrice: input.amount,
            },
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw describeFailedResponse("QuickBooks Invoice create failed", res, body);
    }
    const data = (await res.json()) as { Invoice: { Id: string } };

    return { providerInvoiceId: data.Invoice.Id, providerCustomerId: customerId };
  }

  // Intuit's documented recipe for actually delivering an invoice: POST
  // .../invoice/{id}/send?sendTo=<email>, no body. QBO renders and emails
  // its own invoice template (with a pay-online link) straight to that
  // address -- Base Camp never builds or sends that email itself, same
  // "provider owns sending" split as the rest of section 2. NEEDS LIVE
  // VERIFICATION, same caveat as the rest of this file.
  async sendInvoice(providerInvoiceId: string, email: string): Promise<void> {
    const res = await qboFetch(
      `/invoice/${providerInvoiceId}/send?sendTo=${encodeURIComponent(email)}&minorversion=65`,
      { method: "POST" }
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw describeFailedResponse("QuickBooks Invoice send failed", res, body);
    }
  }

  async getInvoice(providerInvoiceId: string): Promise<InvoiceState> {
    const res = await qboFetch(`/invoice/${providerInvoiceId}?minorversion=65`);
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw describeFailedResponse("QuickBooks Invoice fetch failed", res, body);
    }
    const data = (await res.json()) as {
      Invoice: { Balance?: number; TotalAmt: number; void?: boolean };
    };
    const balance = data.Invoice.Balance ?? 0;
    return {
      balance,
      totalAmount: data.Invoice.TotalAmt,
      paid: balance <= 0 && !data.Invoice.void,
      voided: !!data.Invoice.void,
    };
  }

  // Intuit's documented recipe: base64(HMAC-SHA256(verifierToken,
  // rawRequestBody)), compared against the intuit-signature header.
  // Distinct from SignWell's hash (over "type@time", keyed by a webhook
  // id) -- a different provider's own convention, not a mistake.
  verifyWebhookSignature(rawBody: string, headers: Headers): boolean {
    const verifierToken = process.env.QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN;
    if (!verifierToken) {
      throw new Error("QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN is not set -- cannot verify webhook authenticity.");
    }
    const signature = headers.get("intuit-signature");
    if (!signature) return false;

    const expected = crypto.createHmac("sha256", verifierToken).update(rawBody).digest("base64");
    // Timing-safe comparison, same reasoning as any signature check --
    // crypto.timingSafeEqual requires equal-length buffers, so a length
    // mismatch is treated as a plain false rather than thrown.
    const expectedBuf = Buffer.from(expected);
    const actualBuf = Buffer.from(signature);
    if (expectedBuf.length !== actualBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  }

  parseWebhookEvents(rawBody: string): NormalizedInvoiceEvent[] {
    type Payload = {
      eventNotifications?: {
        realmId?: string;
        dataChangeEvent?: { entities?: { name?: string; id?: string; operation?: string }[] };
      }[];
    };
    let parsed: Payload;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return [];
    }

    const events: NormalizedInvoiceEvent[] = [];
    for (const notification of parsed.eventNotifications ?? []) {
      for (const entity of notification.dataChangeEvent?.entities ?? []) {
        if (!entity.name || !entity.id) continue;
        events.push({
          type:
            entity.name === "Invoice"
              ? "invoice_changed"
              : entity.name === "Payment"
                ? "payment_received"
                : "unknown",
          entityName: entity.name,
          entityId: entity.id,
          raw: entity,
        });
      }
    }
    return events;
  }
}
