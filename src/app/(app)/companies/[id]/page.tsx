import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineLocationField from "@/components/inline/InlineLocationField";
import AdditionalContacts, {
  type LinkedContactItem,
} from "@/components/inline/AdditionalContacts";
import { websiteHref } from "@/lib/url";

// Non-venue company types (promoter, agency, vendor, other) exist in the
// data but we haven't designed how those should work in the product yet --
// showing this as an editable dropdown implied more structure than we've
// actually decided on. Displayed as plain text for now; revisit once
// promoters/agencies/etc get their own real handling.
const VENUE_TYPE_LABEL: Record<string, string> = {
  venue: "Venue",
  promoter: "Promoter",
  agency: "Agency",
  vendor: "Vendor",
  other: "Other",
};

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

  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title")
    .eq("company_id", id)
    .order("full_name");

  const { data: linkedContactsData } = await supabase
    .from("contact_venues")
    .select("id, contacts(id, full_name)")
    .eq("company_id", id)
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
        <h1 className="font-display text-3xl font-medium mb-1">
          <InlineEditField
            table="companies"
            id={venue.id}
            field="name"
            value={venue.name}
            placeholder="Add name"
          />
        </h1>
        <p className="text-black/60 dark:text-white/60 flex flex-wrap items-center gap-x-1">
          <InlineLocationField
            table="companies"
            id={venue.id}
            city={venue.city}
            state={venue.state}
          />
          <span>·</span>
          <span>{VENUE_TYPE_LABEL[venue.type] ?? venue.type}</span>
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Details
          </h2>
          <div className="text-sm text-black/50 dark:text-white/50 space-y-0.5">
            <div>
              <InlineEditField
                table="companies"
                id={venue.id}
                field="phone"
                value={venue.phone}
                placeholder="Add phone"
              />
            </div>
            <div>
              <InlineEditField
                table="companies"
                id={venue.id}
                field="website"
                value={venue.website}
                placeholder="Add website"
                href={websiteHref(venue.website)}
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
              Contacts
            </div>
            {contacts?.length ? (
              <ul className="text-sm space-y-3">
                {contacts.map((c) => (
                  <li key={c.id}>
                    <div className="font-medium">
                      {c.full_name}
                      {c.title && (
                        <span className="font-normal text-black/50 dark:text-white/50">
                          {" "}
                          · {c.title}
                        </span>
                      )}
                    </div>
                    {c.email && (
                      <div className="text-black/60 dark:text-white/60">{c.email}</div>
                    )}
                    {c.phone && (
                      <div className="text-black/60 dark:text-white/60">{c.phone}</div>
                    )}
                  </li>
                ))}
              </ul>
            ) : linkedContacts.length === 0 ? (
              <p className="text-sm text-black/60 dark:text-white/60">
                No contacts on file for this venue.
              </p>
            ) : null}
            <AdditionalContacts kind="venue" targetId={venue.id} items={linkedContacts} />
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

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900 flex flex-col min-h-[220px]">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
          Notes
        </h2>
        <div className="text-sm flex-1">
          <InlineEditField
            table="companies"
            id={venue.id}
            field="notes"
            value={venue.notes}
            type="textarea"
            placeholder="Add notes"
          />
        </div>
      </div>

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      <PlaysTable rows={plays} contextColumnLabel="Event" />
    </div>
  );
}
