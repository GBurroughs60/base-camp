import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";

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
      "id, name, is_public, city, state, country, notes, companies(name, city, state, phone, website), contacts(full_name, email, phone)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!event) notFound();

  const venue = event.companies as unknown as {
    name: string;
    city: string | null;
    state: string | null;
    phone: string | null;
    website: string | null;
  } | null;
  const contact = event.contacts as unknown as {
    full_name: string;
    email: string | null;
    phone: string | null;
  } | null;

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
          <h1 className="font-display text-3xl font-medium mb-1">{event.name}</h1>
          <p className="text-black/60 dark:text-white/60">
            {[event.city, event.state, event.country !== "USA" ? event.country : null]
              .filter(Boolean)
              .join(", ") || "No location on file"}
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            event.is_public
              ? "border-ridge-orange/30 text-ridge-orange-dark dark:text-ridge-orange bg-ridge-orange/5"
              : "border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06]"
          }`}
        >
          {event.is_public ? "Public" : "Private"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Venue
          </h2>
          {venue ? (
            <div className="text-sm space-y-1">
              <div className="font-medium">{venue.name}</div>
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
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No linked venue record.
            </p>
          )}
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Primary Contact
          </h2>
          {contact ? (
            <div className="text-sm space-y-1">
              <div className="font-medium">{contact.full_name}</div>
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
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No contact on file.
            </p>
          )}
        </div>
      </div>

      {event.notes && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">{event.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      <PlaysTable rows={plays} contextColumnLabel="Venue" />
    </div>
  );
}
