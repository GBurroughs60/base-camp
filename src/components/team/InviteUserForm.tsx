"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteTeamMember } from "@/app/actions/userProfiles";

// Team page's "+ New user" (2026-11-09, per Greg). Sends a one-time
// set-password link via a custom Base Camp email (see inviteEmail.ts) --
// the new account shows up in the list below right away, at "Sent",
// without needing a page reload beyond the router.refresh() this already
// does on success.
export default function InviteUserForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setOpen(false);
    setEmail("");
    setDisplayName("");
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteTeamMember(email, displayName);
      if (res.ok) {
        reset();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white px-4 py-2 text-sm font-medium transition-colors"
      >
        + New user
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-white dark:bg-neutral-900 border border-black/10 dark:border-white/10 rounded-xl p-5 shadow-sm flex flex-col gap-3"
    >
      <h2 className="text-sm font-medium">Invite a new user</h2>
      <input
        type="email"
        required
        autoFocus
        placeholder="Email address"
        value={email}
        disabled={pending}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50"
      />
      <input
        type="text"
        placeholder="Display name (optional)"
        value={displayName}
        disabled={pending}
        onChange={(e) => setDisplayName(e.target.value)}
        className="border border-black/15 dark:border-white/15 rounded-md px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-ridge-orange/40 focus:border-ridge-orange transition-colors disabled:opacity-50"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-ridge-orange hover:bg-ridge-orange-dark text-white px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50"
        >
          {pending ? "Sending…" : "Send invite"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className="rounded-md px-4 py-2 text-sm font-medium text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/5 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-sm text-red-700 dark:text-red-400">{error}</p>}
    </form>
  );
}
