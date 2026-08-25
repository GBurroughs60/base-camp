import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineLocationField from "@/components/inline/InlineLocationField";
import InlineSelectField from "@/components/inline/InlineSelectField";
import InlineRelationField from "@/components/inline/InlineRelationField";
import AdditionalContacts, {
  type LinkedContactItem,
} from "@/components/inline/AdditionalContacts";
import { websiteHref } from "@/lib/url";

const VISIBILITY_OPTIONS = [
  { value: "true", label: "Public" },
  { value: "false", label: "Private" },
];

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: event } = await supabase
    .from("events")
    .select(
      "id, name, is_public, city, state, country, website, notes, venue_id, primary_contact_id, companies(id, name, city, state, phone, website), contacts(id, full_name, email, phone)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const venue = event.companies as unknown as {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    phone: string | null;
    website: string | null;
  } | null;
  const contact = event.contacts as unknown as {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;

  const { data: linkedContactsData } = await supabase
    .from("contact_events")
    .select("id, contacts(id, full_name)")
    .eq("event_id", id)
    .order("created_at");

  const linkedContacts: LinkedContactItem[] = (linkedContactsData ?? [])
    .map((row) => {
      const c = row.contacts as unknown as { id: string; full_name: string } | null;
      return c ? { rowId: row.id, contactId: c.id, label: c.full_name } : null;
    })
    .filter((v): v is LinkedContactItem => v !== null);

  const { data: playsData } = await supabase
    .from("plays")
    .select(
      "id, show_date, artists(name), contract_status, guarantee_amount, deal_terms, venue:companies!plays_venue_id_fkey(id, name)"
    )
    .eq("event_id", id)
    .order("show_date", { ascending: true });

  const plays: PlaysTableRow[] = (playsData ?? []).map((p) => {
    const artist = p.artists as unknown as { name: string } | null;
    const playVenue = p.venue as unknown as { id: string; name: string } | null;
    return {
      id: p.id,
      show_date: p.show_date,
      artist_name: artist?.name ?? null,
      guarantee_amount: p.guarantee_amount,
      deal_terms: p.deal_terms,
      contract_status: p.contract_status,
      context_label: playVenue?.name ?? null,
      context_href: playVenue ? `/companies/${playVenue.id}` : null,
    };
  });

  return (
    <div>
      <Link
        href="/events"
        className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
      >
        ← All events
      </Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-medium mb-1">
            <InlineEditField
              table="events"
              id={event.id}
              field="name"
              value={event.name}
              placeholder="Add name"
            />
          </h1>
          <p className="text-black/60 dark:text-white/60 flex flex-wrap items-center gap-x-1">
            <InlineLocationField
              table="events"
              id={event.id}
              city={event.city}
              state={event.state}
            />
            {event.country && event.country !== "USA" && (
              <span className="text-black/40 dark:text-white/40">
                ({event.country})
              </span>
            )}
          </p>
          <p className="text-sm mt-0.5">
            <InlineEditField
              table="events"
              id={event.id}
              field="website"
              value={event.website}
              placeholder="Add website"
              href={websiteHref(event.website)}
            />
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            event.is_public
              ? "border-ridge-orange/30 text-ridge-orange-dark dark:text-ridge-orange bg-ridge-orange/5"
              : "border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06]"
          }`}
        >
          <InlineSelectField
            table="events"
            id={event.id}
            field="is_public"
            value={event.is_public}
            options={VISIBILITY_OPTIONS}
          />
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Venue
          </h2>
          <div className="text-sm space-y-1">
            <div className="font-medium">
              <InlineRelationField
                table="events"
                id={event.id}
                field="venue_id"
                relatedTable="companies"
                value={venue ? { id: venue.id, label: venue.name } : null}
                placeholder="No linked venue record"
              />
            </div>
            {venue && (
              <>
                <div className="text-black/60 dark:text-white/60">
                  {[venue.city, venue.state].filter(Boolean).join(", ") || "—"}
                </div>
                {venue.phone && (
                  <div className="text-black/60 dark:text-white/60">
                    {venue.phone}
                  </div>
                )}
                {venue.website && (
                  <div className="text-black/60 dark:text-white/60">
                    {venue.website}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Contact
          </h2>
          <div className="text-sm space-y-1">
            <div className="font-medium">
              <InlineRelationField
                table="events"
                id={event.id}
                field="primary_contact_id"
                relatedTable="contacts"
                value={contact ? { id: contact.id, label: contact.full_name } : null}
                placeholder="No contact on file"
                confirmSwitch
              />
            </div>
            {contact && (
              <>
                {contact.email && (
                  <div className="text-black/60 dark:text-white/60">
                    {contact.email}
                  </div>
                )}
                {contact.phone && (
                  <div className="text-black/60 dark:text-white/60">
                    {contact.phone}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
              Additional Contacts
            </div>
            <AdditionalContacts
              kind="event"
              targetId={event.id}
              items={linkedContacts}
              bordered={false}
            />
          </div>
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900 flex flex-col min-h-[220px]">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
          Notes
        </h2>
        <div className="text-sm flex-1">
          <InlineEditField
            table="events"
            id={event.id}
            field="notes"
            value={event.notes}
            type="textarea"
            placeholder="Add notes"
          />
        </div>
      </div>

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      <PlaysTable rows={plays} contextColumnLabel="Venue" />
    </div>
  );
}
