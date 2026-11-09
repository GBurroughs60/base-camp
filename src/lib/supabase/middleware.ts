import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login");
  // /approve/[token] is the public "Approve or Decline this offer" page
  // reached from the email -- recipients are outside Ridge and have no
  // Base Camp account, so this route must stay reachable logged-out. /book
  // is the public offer-intake form (venues/promoters submitting a new
  // offer) -- same reasoning, no Base Camp login on that side either.
  // /settle/[token] is the public post-show settlement-report form reached
  // from the settlement-request email -- the artist (or their manager/rep)
  // filling it out has no Base Camp account either, same reasoning as
  // /approve. /api/webhooks is server-to-server: SignWell (and any future provider)
  // calls these with no Base Camp session/cookie at all, so without this
  // exemption every callback got 307-redirected to /login instead of
  // reaching the route handler -- discovered when contract_signatures
  // never advanced past "sent" for a document SignWell itself showed as
  // Completed. Each webhook route authenticates the call on its own terms
  // (see verifyWebhookSignature in signwell.ts), so this exemption doesn't
  // weaken auth -- it just lets those requests reach that check at all.
  // /api/cron is the same situation: Vercel Cron (and a manual `?secret=`
  // curl) calls these with no Base Camp session either, and each route
  // checks CRON_SECRET itself (see isAuthorized in scan-contacts/route.ts)
  // -- found this one live, via the exact same symptom as the webhooks
  // bug above (a 307 to /login instead of reaching the handler), while
  // testing the scan-contacts route directly against production.
  // /legal is the privacy policy / EULA pair required by Intuit's
  // production-keys checklist for the QuickBooks app -- Intuit's own
  // reviewers need to open these with no Base Camp account at all.
  // /auth/confirm is the invite-email link's landing route (src/app/auth/
  // confirm/route.ts) -- it's the thing that *establishes* the session
  // (calling supabase.auth.verifyOtp with the token in the URL), so by
  // definition there's no session yet when this route is hit. Without this
  // exemption the middleware would 307 the brand-new invite link straight
  // to /login before verifyOtp ever ran. /invite/set-password (the page
  // that route redirects to) is deliberately *not* here -- by the time
  // they land there they do have a session, so the normal !user check is
  // exactly what's wanted (anyone who lands there without a valid session
  // gets bounced to /login like any other page).
  // None of these seven are an auth route themselves (a logged-in user
  // hitting them isn't bounced anywhere), just exempt from the login
  // redirect below.
  const isPublicRoute =
    isAuthRoute ||
    request.nextUrl.pathname.startsWith("/approve/") ||
    request.nextUrl.pathname.startsWith("/settle/") ||
    request.nextUrl.pathname.startsWith("/book") ||
    request.nextUrl.pathname.startsWith("/api/webhooks") ||
    request.nextUrl.pathname.startsWith("/api/cron") ||
    request.nextUrl.pathname.startsWith("/legal") ||
    request.nextUrl.pathname.startsWith("/auth/confirm");

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
