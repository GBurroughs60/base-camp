"use client";

import { useState } from "react";
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
    <div className="flex-1 flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold mb-1">Base Camp</h1>
        <p className="text-sm text-black/60 dark:text-white/60 mb-6">
          {mode === "sign-in"
            ? "Sign in to your account"
            : "Create a team account"}
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent"
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-md bg-black text-white dark:bg-white dark:text-black py-2 font-medium disabled:opacity-50"
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
          className="text-sm mt-4 text-black/60 dark:text-white/60 hover:underline"
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
