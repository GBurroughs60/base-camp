"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addContactAssociation,
  makePrimaryContact,
  removeContactAssociation,
  type AssociationKind,
} from "@/app/actions/records";
import RelationSearchPicker from "./RelationSearchPicker";
import { StarIcon } from "./icons";

// This component is only ever used for the two association kinds that are
// actually pickable via RelationSearchPicker (a contact's additional
// venues/events) -- "play" is a valid AssociationKind for the shared
// server actions, but plays aren't searched/created this way, so there's
// no "additional plays" list on the Contact page. See AdditionalContacts
// for the play-page-side equivalent (searching contacts, not plays).
type PickableKind = Exclude<AssociationKind, "play">;

const RELATED_TABLE: Record<PickableKind, "companies" | "events"> = {
  venue: "companies",
  event: "events",
};

const HREF_BASE: Record<PickableKind, string> = {
  venue: "/companies",
  event: "/events",
};

const LABEL: Record<PickableKind, string> = {
  venue: "venue",
  event: "event",
};

export type AssociationItem = {
  /** id of the join-table row (contact_venues.id / contact_events.id) */
  rowId: string;
  targetId: string;
  label: string;
};

// Renders a contact's *additional* (non-primary) venue or event links --
// unlike the primary InlineRelationField, this list can hold any number of
// entries and adding one never disturbs the others.
export default function AdditionalAssociations({
  kind,
  contactId,
  items,
}: {
  kind: PickableKind;
  contactId: string;
  items: AssociationItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(targetId: string) {
    setError(null);
    startTransition(async () => {
      const res = await addContactAssociation(kind, contactId, targetId);
      if (res.ok) {
        setAdding(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleRemove(rowId: string) {
    setError(null);
    startTransition(async () => {
      const res = await removeContactAssociation(kind, rowId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function handleMakePrimary(item: AssociationItem) {
    setError(null);
    startTransition(async () => {
      const res = await makePrimaryContact(kind, contactId, item.targetId, item.rowId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="mt-2">
      {items.length > 0 && (
        <ul className="space-y-1 mb-1.5">
          {items.map((item) => (
            <li
              key={item.rowId}
              className="group/assoc flex items-center justify-between gap-2 text-sm"
            >
              <Link
                href={`${HREF_BASE[kind]}/${item.targetId}`}
                className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {item.label}
              </Link>
              <span className="flex items-center gap-2 opacity-0 group-hover/assoc:opacity-100 transition-opacity shrink-0">
                <button
                  type="button"
                  onClick={() => handleMakePrimary(item)}
                  disabled={pending}
                  aria-label={`Make ${item.label} primary`}
                  title="Make primary"
                  className="text-black/30 dark:text-white/30 hover:text-ridge-orange-dark dark:hover:text-ridge-orange disabled:opacity-50"
                >
                  <StarIcon className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.rowId)}
                  disabled={pending}
                  aria-label={`Remove ${item.label}`}
                  className="text-xs text-black/40 dark:text-white/40 hover:text-red-500 disabled:opacity-50"
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="relative">
          <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
            <RelationSearchPicker table={RELATED_TABLE[kind]} onSelect={(id) => handleAdd(id)} />
          </div>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="mt-1 text-xs text-black/40 dark:text-white/40 hover:text-black/70 dark:hover:text-white/70"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-xs text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
        >
          + Add another {LABEL[kind]}
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
