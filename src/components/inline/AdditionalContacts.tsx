"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  addContactAssociation,
  removeContactAssociation,
  type AssociationKind,
} from "@/app/actions/records";
import RelationSearchPicker from "./RelationSearchPicker";

export type LinkedContactItem = {
  /** id of the join-table row (contact_venues.id / contact_events.id) */
  rowId: string;
  contactId: string;
  label: string;
};

// The mirror image of AdditionalAssociations: rendered on a Venue or Event
// detail page to search for (or create) a Contact and link them here via
// the same contact_venues/contact_events join tables, without touching
// that contact's own primary venue/event on their own record.
export default function AdditionalContacts({
  kind,
  targetId,
  items,
}: {
  kind: AssociationKind;
  targetId: string;
  items: LinkedContactItem[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleAdd(contactId: string) {
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

  return (
    <div className="mt-3 pt-3 border-t border-black/10 dark:border-white/10">
      {items.length > 0 && (
        <ul className="text-sm space-y-1.5 mb-2">
          {items.map((item) => (
            <li
              key={item.rowId}
              className="group/contact flex items-center justify-between"
            >
              <Link
                href={`/contacts/${item.contactId}`}
                className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {item.label}
              </Link>
              <button
                type="button"
                onClick={() => handleRemove(item.rowId)}
                disabled={pending}
                aria-label={`Remove ${item.label}`}
                className="opacity-0 group-hover/contact:opacity-100 text-xs text-black/40 dark:text-white/40 hover:text-red-500 transition-opacity disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="relative">
          <div className="rounded-lg border border-black/10 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-lg overflow-hidden">
            <RelationSearchPicker table="contacts" onSelect={(id) => handleAdd(id)} />
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
          + Add contact
        </button>
      )}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}
