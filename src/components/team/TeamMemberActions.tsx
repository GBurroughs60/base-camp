"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  type TeamMember,
  deactivateUser,
  reactivateUser,
  removeUser,
  resendInvite,
  setAdmin,
} from "@/app/actions/userProfiles";

// Per-row admin actions on the Team page (2026-11-09, per Greg). Every
// action here is also re-checked server-side in userProfiles.ts
// (requireAdmin, plus each action's own self-protection rule) -- hiding a
// button for your own row is a UX nicety, not the actual enforcement.
export default function TeamMemberActions({
  member,
  currentUserId,
}: {
  member: TeamMember;
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Two-step confirm for Remove -- no native confirm() dialog (this app
  // doesn't use those anywhere else), just the button itself turning into
  // a "Yes, remove"/"Cancel" pair on first click, same inline-confirm
  // pattern as everything else here rather than introducing a different
  // one just for this.
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  const isSelf = member.id === currentUserId;

  function run(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  if (isSelf) {
    return (
      <span className="shrink-0 text-xs text-black/40 dark:text-white/40">That&apos;s you</span>
    );
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <div className="flex items-center gap-3 text-xs font-medium">
        {(member.status === "invited" || member.status === "started") && (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => resendInvite(member.id))}
            className="text-black/60 dark:text-white/60 hover:text-ridge-orange disabled:opacity-50 transition-colors"
          >
            Resend invite
          </button>
        )}

        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => setAdmin(member.id, !member.isAdmin))}
          className="text-black/60 dark:text-white/60 hover:text-ridge-orange disabled:opacity-50 transition-colors"
        >
          {member.isAdmin ? "Remove admin" : "Make admin"}
        </button>

        {member.status === "deactivated" ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => reactivateUser(member.id))}
            className="text-emerald-700 dark:text-emerald-400 hover:opacity-70 disabled:opacity-50 transition-colors"
          >
            Reactivate
          </button>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => deactivateUser(member.id))}
            className="text-black/60 dark:text-white/60 hover:text-ridge-orange disabled:opacity-50 transition-colors"
          >
            Deactivate
          </button>
        )}

        {confirmingRemove ? (
          <span className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeUser(member.id))}
              className="text-red-700 dark:text-red-400 font-semibold hover:opacity-70 disabled:opacity-50 transition-colors"
            >
              Yes, remove
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmingRemove(false)}
              className="text-black/40 dark:text-white/40 hover:text-black/60 dark:hover:text-white/60 disabled:opacity-50 transition-colors"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirmingRemove(true)}
            className="text-red-700 dark:text-red-400 hover:opacity-70 disabled:opacity-50 transition-colors"
          >
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-700 dark:text-red-400 text-right max-w-xs">{error}</p>}
    </div>
  );
}
