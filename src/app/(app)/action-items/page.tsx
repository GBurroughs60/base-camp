import { createClient } from "@/lib/supabase/server";
import ActionItemsList, { type ActionItemRow } from "@/components/ActionItemsList";

type RawActionItem = {
  id: string;
  source: "auto" | "manual";
  event_id: string | null;
  occurrence_date: string | null;
  title: string | null;
  due_date: string | null;
  company_id: string | null;
  contact_id: string | null;
  artist_id: string | null;
  notes: string | null;
};

export default async function ActionItemsPage() {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);

  // Visible = open, and either never hidden or past its hidden_until.
  // superseded/completed rows never show up here at all.
  const { data } = await supabase
    .from("action_items")
    .select(
      "id, source, event_id, occurrence_date, title, due_date, company_id, contact_id, artist_id, notes"
    )
    .eq("status", "open")
    .or(`hidden_until.is.null,hidden_until.lte.${today}`);

  const items = (data ?? []) as RawActionItem[];

  // Event ids from auto rows AND any manual task that happens to link to
  // an event -- both need the event's own name/city/state/website plus a
  // second hop to its venue/contact for phone/email.
  const eventIds = Array.from(new Set(items.map((i) => i.event_id).filter((v): v is string => !!v)));

  const { data: events } = eventIds.length
    ? await supabase
        .from("events")
        .select("id, name, city, state, venue_id, primary_contact_id")
        .in("id", eventIds)
    : { data: [] as { id: string; name: string; city: string | null; state: string | null; venue_id: string | null; primary_contact_id: string | null }[] };

  const eventById = new Map((events ?? []).map((e) => [e.id as string, e]));

  // source_url lives on event_occurrences (events itself has no such
  // column) -- fetch every occurrence row for these events and match each
  // auto item to the exact occurrence it was created from.
  const { data: occurrences } = eventIds.length
    ? await supabase
        .from("event_occurrences")
        .select("event_id, occurrence_date, source_url")
        .in("event_id", eventIds)
    : { data: [] as { event_id: string; occurrence_date: string | null; source_url: string | null }[] };

  const sourceUrlByEventDate = new Map<string, string | null>();
  for (const occ of occurrences ?? []) {
    if (!occ.occurrence_date) continue;
    sourceUrlByEventDate.set(`${occ.event_id}|${occ.occurrence_date}`, occ.source_url ?? null);
  }

  // Union every company/contact/artist id this page needs: the event's own
  // venue/primary contact (second hop), plus whatever a manual task links
  // to directly.
  const companyIds = new Set<string>();
  const contactIds = new Set<string>();
  const artistIds = new Set<string>();
  for (const e of events ?? []) {
    if (e.venue_id) companyIds.add(e.venue_id);
    if (e.primary_contact_id) contactIds.add(e.primary_contact_id);
  }
  for (const i of items) {
    if (i.company_id) companyIds.add(i.company_id);
    if (i.contact_id) contactIds.add(i.contact_id);
    if (i.artist_id) artistIds.add(i.artist_id);
  }

  const [{ data: companies }, { data: contacts }, { data: artists }] = await Promise.all([
    companyIds.size
      ? supabase.from("companies").select("id, name, email, phone, website, city, state").in("id", Array.from(companyIds))
      : Promise.resolve({ data: [] as { id: string; name: string; email: string | null; phone: string | null; website: string | null; city: string | null; state: string | null }[] }),
    contactIds.size
      ? supabase.from("contacts").select("id, full_name, email, phone").in("id", Array.from(contactIds))
      : Promise.resolve({ data: [] as { id: string; full_name: string; email: string | null; phone: string | null }[] }),
    artistIds.size
      ? supabase.from("artists").select("id, name").in("id", Array.from(artistIds))
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const companyById = new Map((companies ?? []).map((c) => [c.id as string, c]));
  const contactById = new Map((contacts ?? []).map((c) => [c.id as string, c]));
  const artistById = new Map((artists ?? []).map((a) => [a.id as string, a]));

  const rows: ActionItemRow[] = items.map((item) => {
    const event = item.event_id ? eventById.get(item.event_id) : undefined;
    const venue = event?.venue_id ? companyById.get(event.venue_id) : undefined;
    const eventContact = event?.primary_contact_id ? contactById.get(event.primary_contact_id) : undefined;
    const sourceUrl =
      item.event_id && item.occurrence_date
        ? (sourceUrlByEventDate.get(`${item.event_id}|${item.occurrence_date}`) ?? null)
        : null;

    const linkedCompany = item.company_id ? companyById.get(item.company_id) : undefined;
    const linkedContact = item.contact_id ? contactById.get(item.contact_id) : undefined;
    const linkedArtist = item.artist_id ? artistById.get(item.artist_id) : undefined;

    return {
      id: item.id,
      source: item.source,
      sortDate: item.occurrence_date ?? item.due_date ?? today,
      eventId: item.event_id,
      eventName: event?.name ?? null,
      occurrenceDate: item.occurrence_date,
      venueLabel: venue ? [venue.name, [venue.city, venue.state].filter(Boolean).join(", ")].filter(Boolean).join(" — ") : null,
      contactEmail: eventContact?.email ?? venue?.email ?? null,
      contactPhone: eventContact?.phone ?? venue?.phone ?? null,
      sourceLink: sourceUrl ?? venue?.website ?? null,
      title: item.title,
      dueDate: item.due_date,
      notes: item.notes,
      linkedLabel: linkedCompany?.name ?? linkedContact?.full_name ?? linkedArtist?.name ?? null,
      linkedHref: linkedCompany
        ? `/companies/${linkedCompany.id}`
        : linkedContact
          ? `/contacts/${linkedContact.id}`
          : linkedArtist
            ? `/artists/${linkedArtist.id}`
            : null,
    };
  });

  rows.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Action List</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {rows.length} to work — events within the next 180 days, plus anything you&apos;ve added
        yourself. Mark complete once you&apos;ve pitched it, or dismiss for a while if it&apos;s not time yet.
      </p>

      <ActionItemsList rows={rows} />
    </div>
  );
}
