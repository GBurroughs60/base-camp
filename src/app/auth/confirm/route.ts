import { type EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Lands here from the link inside the invite email (see
// src/lib/inviteEmail.ts and inviteTeamMember in app/actions/
// userProfiles.ts) -- the standard Supabase SSR pattern for a *custom*-sent
// auth email: generateLink() returns a hashed_token rather than sending
// anything itself, and this route is what actually exchanges it for a
// session (supabase.auth.verifyOtp), using the cookie-aware server client
// so the session lands in the browser's cookies rather than a URL
// fragment only a client-side script could read. Exempted from the login
// redirect in src/lib/supabase/middleware.ts -- there's no session yet
// when this route runs, by definition.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/";

  if (tokenHash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
  }

  return NextResponse.redirect(new URL("/login?error=invite_link_invalid", request.url));
}
