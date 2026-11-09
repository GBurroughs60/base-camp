"use client";

import { useState, useTransition } from "react";
import { completeInviteSignup } from "@/app/actions/userProfiles";

// Mirrors /login's form styling (same input/button classes) so this reads
// as the same family rather than a visibly different one-off page.
export default function SetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    startTransition(async () => {
      const res = await completeInviteSignup(password);
      // A successful call never returns -- completeInviteSignup redirects
      // server-side. Only a failure actually produces a value to show.
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-6 shadow-sm"
    >
      <input
        type="password"
        required
        minLength={6}
        placeholder="New password"
        value={password}
        disabled={pending}
        onChange={(e) => setPassword(e.target.value)}
        className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50"
      />
      <input
        type="password"
        required
        minLength={6}
        placeholder="Confirm password"
        value={confirm}
        disabled={pending}
        onChange={(e) => setConfirm(e.target.value)}
        className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white py-2 font-medium transition-colors disabled:opacity-50"
      >
        {pending ? "Please wait…" : "Set password and continue"}
      </button>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </form>
  );
}
