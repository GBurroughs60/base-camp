import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { cookies } from "next/headers";

const AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const STATE_COOKIE = "qbo_oauth_state";

// Kicks off the OAuth2 Authorization Code flow -- the "Connect QuickBooks"
// button on Settings > QuickBooks hits this route, which bounces the
// browser to Intuit's own consent screen and back to
// /api/quickbooks/callback. No Base Camp auth check here beyond whatever
// already gates the (app) route tree the settings page lives in -- this
// route itself is unauthenticated-session-reachable the way any redirect
// target has to be, but it does nothing but redirect to Intuit.
export async function GET(req: NextRequest) {
  const clientId = process.env.QUICKBOOKS_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      {
        error:
          "QUICKBOOKS_CLIENT_ID is not set -- register a developer app at developer.intuit.com and add it (and QUICKBOOKS_CLIENT_SECRET) as Vercel env vars first.",
      },
      { status: 500 }
    );
  }

  // CSRF guard: a random value round-tripped through Intuit's redirect and
  // checked against this cookie in the callback -- same purpose as any
  // OAuth "state" param.
  const state = crypto.randomBytes(24).toString("hex");
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 600, // 10 minutes -- the whole round trip should take seconds
    path: "/",
  });

  const redirectUri = new URL("/api/quickbooks/callback", req.url).toString();
  const authorizeUrl = new URL(AUTHORIZE_URL);
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", "com.intuit.quickbooks.accounting");
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("state", state);

  return NextResponse.redirect(authorizeUrl.toString());
}
