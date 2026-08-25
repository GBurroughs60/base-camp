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
  bordered = true,
}: {
  kind: AssociationKind;
  targetId: string;
  items: LinkedContactItem[];
  /** Set false when a parent section already supplies its own top divider
   * and subheading (e.g. an "Additional Contacts" label) -- avoids stacking
   * two dividers back to back. */
  bordered?: boolean;
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

  function handleMakePrimary(item: LinkedContactItem) {
    setError(null);
    startTransition(async () => {
      const res = await makePrimaryContact(kind, item.contactId, targetId, item.rowId);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className={bordered ? "mt-3 pt-3 border-t border-black/10 dark:border-white/10" : ""}>
      {items.length > 0 && (
        <ul className="text-sm space-y-1.5 mb-2">
          {items.map((item) => (
            <li
              key={item.rowId}
              className="group/contact flex items-center justify-between gap-2"
            >
              <Link
                href={`/contacts/${item.contactId}`}
                className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {item.label}
              </Link>
              <span className="flex items-center gap-2 opacity-0 group-hover/contact:opacity-100 transition-opacity shrink-0">
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
