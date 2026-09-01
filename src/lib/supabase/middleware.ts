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
  // Neither is an auth route itself (a logged-in user hitting them isn't
  // bounced anywhere), just exempt from the login redirect below.
  const isPublicRoute =
    isAuthRoute ||
    request.nextUrl.pathname.startsWith("/approve/") ||
    request.nextUrl.pathname.startsWith("/book");

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
