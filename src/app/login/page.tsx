"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    if (mode === "sign-in") {
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
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        setMessage(
          "Account created. If email confirmation is required, check your inbox, then sign in."
        );
        setMode("sign-in");
      }
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
            {mode === "sign-in"
              ? "Sign in to your account"
              : "Create a team account"}
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
            {loading
              ? "Please wait…"
              : mode === "sign-in"
              ? "Sign in"
              : "Create account"}
          </button>
        </form>
        {message && (
          <p className="text-sm mt-3 text-black/70 dark:text-white/70">
            {message}
          </p>
        )}
        <button
          className="text-sm mt-4 text-black/60 dark:text-white/60 hover:text-ridge-orange transition-colors block mx-auto"
          onClick={() =>
            setMode(mode === "sign-in" ? "sign-up" : "sign-in")
          }
        >
          {mode === "sign-in"
            ? "Need an account? Sign up"
            : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
