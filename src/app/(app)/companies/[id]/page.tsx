import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";

export default async function VenueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venue } = await supabase
    .from("companies")
    .select("id, name, type, city, state, country, phone, website, notes")
    .eq("id", id)
    .maybeSingle();

  if (!venue) notFound();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, is_public")
    .eq("venue_id", id)
    .order("name");

  const { data: playsData } = await supabase
    .from("plays")
    .select(
      "id, show_date, artists(name), contract_status, guarantee_amount, deal_terms, events(id, name)"
    )
    .eq("venue_id", id)
    .order("show_date", { ascending: true });

  const plays: PlaysTableRow[] = (playsData ?? []).map((p) => {
    const artist = p.artists as unknown as { name: string } | null;
    const playEvent = p.events as unknown as { id: string; name: string } | null;
    return {
      id: p.id,
      show_date: p.show_date,
      artist_name: artist?.name ?? null,
      guarantee_amount: p.guarantee_amount,
      deal_terms: p.deal_terms,
      contract_status: p.contract_status,
      context_label: playEvent?.name ?? "No event",
      context_href: playEvent ? `/events/${playEvent.id}` : null,
    };
  });

  return (
    <div>
      <Link
        href="/companies"
        className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
      >
        ← All venues
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="font-display text-3xl font-medium mb-1">{venue.name}</h1>
        <p className="text-black/60 dark:text-white/60">
          {[venue.city, venue.state, venue.country !== "USA" ? venue.country : null]
            .filter(Boolean)
            .join(", ") || "No location on file"}
          {venue.type ? ` · ${venue.type}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Contact Info
          </h2>
          <div className="text-sm space-y-1">
            {venue.phone && (
              <div className="text-black/60 dark:text-white/60">{venue.phone}</div>
            )}
            {venue.website && (
              <div className="text-black/60 dark:text-white/60">{venue.website}</div>
            )}
            {!venue.phone && !venue.website && (
              <p className="text-black/60 dark:text-white/60">No contact info on file.</p>
            )}
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Events at this Venue
          </h2>
          {events?.length ? (
            <ul className="text-sm space-y-1.5">
              {events.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/events/${e.id}`}
                    className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {e.name}
                  </Link>
                  <span className="text-black/40 dark:text-white/40">
                    {" "}
                    · {e.is_public ? "Public" : "Private"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No named events at this venue — plays here happen directly.
            </p>
          )}
        </div>
      </div>

      {venue.notes && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">{venue.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      <PlaysTable rows={plays} contextColumnLabel="Event" />
    </div>
  );
}
