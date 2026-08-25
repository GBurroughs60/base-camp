"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addArtistTeamMember,
  removeArtistTeamMember,
  type ArtistTeamRole,
} from "@/app/actions/records";
import RelationSearchPicker from "./RelationSearchPicker";

export type ArtistTeamMember = {
  /** id of the contact_artists join-table row */
  rowId: string;
  contactId: string;
  label: string;
  companyName: string | null;
};

const ROLE_LABELS: Record<ArtistTeamRole, string> = {
  manager: "Manager",
  agent: "Booking Agent",
  tour_manager: "Tour Manager",
  publicist: "Publicist",
  other: "Other",
};

const ROLES: ArtistTeamRole[] = ["manager", "agent", "tour_manager", "publicist", "other"];

// Unlike AdditionalContacts (a flat "primary + additional" list), an
// artist's team has no single primary contact -- Manager and Booking Agent
// are different roles entirely, each holding any number of contacts. So
// this renders one role-labeled group per role, each with its own
// search-or-create picker into the same contacts table.
export default function ArtistTeam({
  artistId,
  membersByRole,
}: {
  artistId: string;
  membersByRole: Record<ArtistTeamRole, ArtistTeamMember[]>;
}) {
  const router = useRouter();
  const [addingRole, setAddingRole] = useState<ArtistTeamRole | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(role: ArtistTeamRole, contactId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addArtistTeamMember(artistId, contactId, role);
      if (res.ok) {
        setAddingRole(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleRemove(rowId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeArtistTeamMember(rowId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="space-y-4">
      {ROLES.map((role) => {
        const members = membersByRole[role] ?? [];
        return (
          <div key={role}>
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-1.5 uppercase tracking-wide">
              {ROLE_LABELS[role]}
            </div>

            {members.length > 0 && (
              <ul className="text-sm space-y-1.5 mb-1.5">
                {members.map((m) => (
                  <li
                    key={m.rowId}
                    className="group/member flex items-center justify-between gap-2"
                  >
                    <span>
                      <Link
                        href={`/contacts/${m.contactId}`}
                        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                      >
                        {m.label}
                      </Link>
                      {m.companyName && (
                        <span className="text-black/50 dark:text-white/50">
                          {" "}
                          · {m.companyName}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemove(m.rowId)}
                      disabled={pending}
                      aria-label={`Remove ${m.label}`}
                      className="text-xs text-black/40 dark:text-white/40 hover:text-red-500 disabled:opacity-50 opacity-0 group-hover/member:opacity-100 transition-opacity shrink-0"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {addingRole === role ? (
              <div className="relative">
                <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
                  <RelationSearchPicker
                    table="contacts"
                    onSelect={(id) => handleAdd(role, id)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setAddingRole(null)}
                  className="mt-1 text-xs text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddingRole(role)}
                className="text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                + Add {ROLE_LABELS[role].toLowerCase()}
              </button>
            )}
          </div>
        );
      })}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
