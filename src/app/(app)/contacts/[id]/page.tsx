import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: contact } = await supabase
    .from("contacts")
    .select(
      "id, full_name, email, phone, title, notes, company_id, companies(id, name, city, state, phone, website)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!contact) notFound();

  const company = contact.companies as unknown as {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
    phone: string | null;
    website: string | null;
  } | null;

  const { data: events } = await supabase
    .from("events")
    .select("id, name, is_public")
    .eq("primary_contact_id", id)
    .order("name");

  const { data: playsData } = await supabase
    .from("plays")
    .select(
      "id, show_date, artists(name), contract_status, guarantee_amount, deal_terms, venue:companies!plays_venue_id_fkey(id, name)"
    )
    .eq("primary_contact_id", id)
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
        href="/contacts"
        className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
      >
        ← All contacts
      </Link>

      <div className="mt-3 mb-6">
        <h1 className="font-display text-3xl font-medium mb-1">{contact.full_name}</h1>
        <p className="text-black/60 dark:text-white/60">
          {contact.title ?? "No title on file"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Details
          </h2>
          <div className="text-sm space-y-1">
            {contact.email && (
              <div className="text-black/70 dark:text-white/70">{contact.email}</div>
            )}
            {contact.phone && (
              <div className="text-black/70 dark:text-white/70">{contact.phone}</div>
            )}
            {!contact.email && !contact.phone && (
              <p className="text-black/60 dark:text-white/60">
                No email or phone on file.
              </p>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
              Venue
            </div>
            {company ? (
              <div className="text-sm space-y-1">
                <Link
                  href={`/companies/${company.id}`}
                  className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                >
                  {company.name}
                </Link>
                <div className="text-black/60 dark:text-white/60">
                  {[company.city, company.state].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
            ) : (
              <p className="text-sm text-black/60 dark:text-white/60">
                Not tied to a single venue — see events and plays below.
              </p>
            )}
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Events
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
              Not the primary contact on any named events — see plays below.
            </p>
          )}
        </div>
      </div>

      {contact.notes && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">{contact.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      {plays.length ? (
        <PlaysTable rows={plays} contextColumnLabel="Venue" />
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          No plays linked to this contact yet.
        </p>
      )}
    </div>
  );
}
