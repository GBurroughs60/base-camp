"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// URL ?error= values a redirect can land here with, outside the normal
// sign-in failure path below (which just shows Supabase's own error.message).
// Currently just the one case: src/app/auth/confirm/route.ts sends someone
// here when an invite-email link's token is missing, expired, or already
// used (invite links are one-time-use -- see inviteTeamMember's "Resend
// invite" for the fix, not a second click on the same email).
const URL_ERROR_MESSAGES: Record<string, string> = {
  invite_link_invalid:
    "That invite link isn't valid anymore -- it may have already been used, or expired. Ask whoever invited you to resend it.",
};

// useSearchParams() needs a Suspense boundary or `next build` fails to
// prerender this page at all (Next.js bails the whole page to
// client-only rendering otherwise -- see the linked docs in the error).
// The actual sign-in form carries no server data of its own, so this is
// just bureaucracy for Next's benefit, not a real loading state -- nothing
// here ever meaningfully shows the fallback.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const urlError = searchParams.get("error");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage(error.message);
    } else {
      router.replace("/");
      router.refresh();
    }
    setLoading(false);
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 bg-neutral-50 dark:bg-neutral-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <Image
            src="/brand/ridge-dark-lockup.png"
            alt="The Ridge Music Group"
            width={128}
            height={128}
            className="mb-5 dark:hidden"
            priority
          />
          <Image
            src="/brand/ridge-light-lockup.png"
            alt="The Ridge Music Group"
            width={128}
            height={128}
            className="mb-5 hidden dark:block"
            priority
          />
          <h1 className="font-display text-2xl font-medium tracking-tight">
            Base Camp
          </h1>
          <p className="text-sm text-black/60 dark:text-white/60 mt-1">
            Sign in to your account
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm"
        >
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2 font-medium transition-colors disabled:opacity-50"
          >
            {loading ? "Please wait…" : "Sign in"}
          </button>
        </form>
        {urlError && !message && (
          <p className="text-sm mt-3 text-red-700 dark:text-red-400">
            {URL_ERROR_MESSAGES[urlError] ?? "Something went wrong -- please try again."}
          </p>
        )}
        {message && (
          <p className="text-sm mt-3 text-black/70 dark:text-white/70">
            {message}
          </p>
        )}
        <p className="text-sm mt-4 text-black/50 dark:text-white/50 text-center">
          Need an account? Ask Greg to set one up for you.
        </p>
      </div>
    </div>
  );
}
