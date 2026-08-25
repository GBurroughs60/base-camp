import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineRelationField from "@/components/inline/InlineRelationField";
import AdditionalAssociations, {
  type AssociationItem,
} from "@/components/inline/AdditionalAssociations";

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

  const { data: additionalVenuesData } = await supabase
    .from("contact_venues")
    .select("id, companies(id, name)")
    .eq("contact_id", id)
    .order("created_at");

  const additionalVenues: AssociationItem[] = (additionalVenuesData ?? [])
    .map((row) => {
      const c = row.companies as unknown as { id: string; name: string } | null;
      return c ? { rowId: row.id, targetId: c.id, label: c.name } : null;
    })
    .filter((v): v is AssociationItem => v !== null);

  const { data: additionalEventsData } = await supabase
    .from("contact_events")
    .select("id, events(id, name)")
    .eq("contact_id", id)
    .order("created_at");

  const additionalEvents: AssociationItem[] = (additionalEventsData ?? [])
    .map((row) => {
      const e = row.events as unknown as { id: string; name: string } | null;
      return e ? { rowId: row.id, targetId: e.id, label: e.name } : null;
    })
    .filter((v): v is AssociationItem => v !== null);

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
        <h1 className="font-display text-3xl font-medium mb-1">
          <InlineEditField
            table="contacts"
            id={contact.id}
            field="full_name"
            value={contact.full_name}
            placeholder="Add name"
          />
        </h1>
        <p className="text-black/60 dark:text-white/60">
          <InlineEditField
            table="contacts"
            id={contact.id}
            field="title"
            value={contact.title}
            placeholder="Add title"
          />
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Details
          </h2>
          <div className="text-sm space-y-1">
            <div className="text-black/70 dark:text-white/70">
              <InlineEditField
                table="contacts"
                id={contact.id}
                field="email"
                value={contact.email}
                placeholder="Add email"
              />
            </div>
            <div className="text-black/70 dark:text-white/70">
              <InlineEditField
                table="contacts"
                id={contact.id}
                field="phone"
                value={contact.phone}
                placeholder="Add phone"
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
              Venue
            </div>
            <div className="text-sm space-y-1">
              <div className="font-medium">
                <InlineRelationField
                  table="contacts"
                  id={contact.id}
                  field="company_id"
                  relatedTable="companies"
                  value={company ? { id: company.id, label: company.name } : null}
                  placeholder="Not tied to a single venue"
                  confirmSwitch
                />
              </div>
              {company && (
                <div className="text-black/60 dark:text-white/60">
                  {[company.city, company.state].filter(Boolean).join(", ") || "—"}
                </div>
              )}
            </div>
            <AdditionalAssociations kind="venue" contactId={contact.id} items={additionalVenues} />
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
          <AdditionalAssociations kind="event" contactId={contact.id} items={additionalEvents} />
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900 flex flex-col min-h-[220px]">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
          Notes
        </h2>
        <div className="text-sm flex-1">
          <InlineEditField
            table="contacts"
            id={contact.id}
            field="notes"
            value={contact.notes}
            type="textarea"
            placeholder="Add notes"
          />
        </div>
      </div>

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      {plays.length ? (
        <PlaysTable rows={plays} contextColumnLabel="Venue" showContract={false} />
      ) : (
        <p className="text-sm text-black/60 dark:text-white/60">
          No plays linked to this contact yet.
        </p>
      )}
    </div>
  );
}
