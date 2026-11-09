import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "./SetPasswordForm";

// Lands here from src/app/auth/confirm/route.ts once an invite/magiclink
// token has been exchanged for a real session -- NOT in middleware.ts's
// public-route allowlist, deliberately: by the time anyone reaches this
// page they already have a session (that's what the confirm route just
// did), so the normal !user -> /login redirect is exactly what's wanted
// for anyone who somehow lands here without one.
export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="flex-1 flex items-center justify-center px-6 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <h1 className="font-display text-2xl font-medium tracking-tight">
            Welcome to Base Camp
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Set a password for {user.email}
          </p>
        </div>
        <SetPasswordForm />
      </div>
    </div>
  );
}
