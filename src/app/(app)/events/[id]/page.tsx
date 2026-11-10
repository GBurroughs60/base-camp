import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";
import InlineEditField from "@/components/inline/InlineEditField";
import CopyButton from "@/components/inline/CopyButton";
import InlineLocationField from "@/components/inline/InlineLocationField";
import InlineSelectField from "@/components/inline/InlineSelectField";
import InlineRelationField from "@/components/inline/InlineRelationField";
import GenreTagsField from "@/components/inline/GenreTagsField";
import CollapsibleSection from "@/components/inline/CollapsibleSection";
import AdditionalContacts, {
  type LinkedContactItem,
} from "@/components/inline/AdditionalContacts";
import RecordActionsMenu from "@/components/inline/RecordActionsMenu";
import { websiteHref } from "@/lib/url";
import { listDistinctGenreTags } from "@/app/actions/eventGenre";
import { listAttributableTeamMembers } from "@/app/actions/userProfiles";

const VISIBILITY_OPTIONS = [
  { value: "true", label: "Public" },
  { value: "false", label: "Private" },
];

const RECONTACT_FLOOR_DAYS = 30;

function daysAgo(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

function formatRelative(iso: string): string {
  const d = daysAgo(iso);
  if (d <= 0) return "today";
  if (d === 1) return "yesterday";
  if (d < 30) return `${d} days ago`;
  const months = Math.round(d / 30);
  return months <= 1 ? "about a month ago" : `about ${months} months ago`;
}

function formatLogDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

type OutreachTouch = {
  sentAt: string;
  userDisplayName: string | null;
  artistNames: string[];
};

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
      "id, name, is_public, city, state, country, website, notes, genre_tags, typical_performance_days, submission_notes, research_log, venue_id, primary_contact_id, archived, companies(id, name, city, state, phone, website), contacts(id, full_name, email, phone)"
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
      "id, show_date, artist_id, artists(name), contract_status, guarantee_amount, deal_terms, venue:companies!plays_venue_id_fkey(id, name)"
    )
    .eq("event_id", id)
    .order("show_date", { ascending: true });

  const plays: PlaysTableRow[] = (playsData ?? []).map((p) => {
    const artist = p.artists as unknown as { name: string } | null;
    const playVenue = p.venue as unknown as { id: string; name: string } | null;
    return {
      id: p.id,
      show_date: p.show_date,
      artist_id: p.artist_id,
      artist_name: artist?.name ?? null,
      guarantee_amount: p.guarantee_amount,
      deal_terms: p.deal_terms,
      contract_status: p.contract_status,
      context_label: playVenue?.name ?? null,
      context_href: playVenue ? `/companies/${playVenue.id}` : null,
    };
  });

  // Outreach history -- who's been pitched for this event and when. Rows
  // written for the same Action List "Mark complete" share one sent_at
  // (a single multi-row INSERT, see completeActionItem), so grouping by
  // that exact timestamp reconstructs "one pitch touch, several artists"
  // instead of splitting it into one line per artist (2026-11-05, per
  // Greg).
  const [{ data: outreachRows }, teamMembers, genreSuggestions] = await Promise.all([
    supabase
      .from("outreach_log")
      .select("sent_at, user_id, artists(name)")
      .eq("event_id", id)
      .order("sent_at", { ascending: false }),
    listAttributableTeamMembers(),
    listDistinctGenreTags(),
  ]);

  // No email to fall back to here (listAttributableTeamMembers is the
  // non-admin-safe listing -- see its own comment) -- a teammate who
  // hasn't set a display name yet shows generically rather than leaking
  // their email to a non-admin viewer.
  const displayNameByUserId = new Map(
    teamMembers.map((m) => [m.id, m.displayName ?? "A teammate"])
  );

  const touchesBySentAt = new Map<string, OutreachTouch>();
  for (const row of outreachRows ?? []) {
    const artist = row.artists as unknown as { name: string } | null;
    const key = row.sent_at as string;
    const existing = touchesBySentAt.get(key);
    if (existing) {
      if (artist?.name) existing.artistNames.push(artist.name);
    } else {
      touchesBySentAt.set(key, {
        sentAt: key,
        userDisplayName: row.user_id ? (displayNameByUserId.get(row.user_id) ?? null) : null,
        artistNames: artist?.name ? [artist.name] : [],
      });
    }
  }
  const outreachTouches = Array.from(touchesBySentAt.values()).sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt)
  );
  const lastTouch = outreachTouches[0] ?? null;
  const lastTouchRecent = lastTouch ? daysAgo(lastTouch.sentAt) <= RECONTACT_FLOOR_DAYS : false;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/events"
          className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        >
          ← All events
        </Link>
        <RecordActionsMenu
          table="events"
          id={event.id}
          name={event.name}
          archived={event.archived}
          archiveNote={plays.length > 0 ? `all ${plays.length} play(s) booked here stay exactly as they are` : undefined}
        />
      </div>

      <div className="flex items-start justify-between mt-3 mb-6 gap-4">
        <div>
          <h1 className="font-display text-3xl font-medium mb-1">
            <InlineEditField
              table="events"
              id={event.id}
              field="name"
              value={event.name}
              placeholder="Add name"
            />
            {event.archived && (
              <span className="ml-2 align-middle text-xs px-2 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
                Archived
              </span>
            )}
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
        <div className="flex flex-col items-end gap-1.5 shrink-0">
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
          {lastTouch && (
            <span
              title={new Date(lastTouch.sentAt).toLocaleString()}
              className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${
                lastTouchRecent
                  ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400 bg-emerald-500/5"
                  : "border-black/15 dark:border-white/15 text-black/50 dark:text-white/50"
              }`}
            >
              Pitched {formatRelative(lastTouch.sentAt)}
              {lastTouch.artistNames.length > 0 && ` · ${lastTouch.artistNames.join(", ")}`}
              {lastTouch.userDisplayName && ` · by ${lastTouch.userDisplayName}`}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
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
                  <div className="text-black/60 dark:text-white/60 inline-flex items-center gap-1.5">
                    {contact.email}
                    <CopyButton value={contact.email} />
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

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
          Booking Details
        </h2>
        <div className="text-sm divide-y divide-black/5 dark:divide-white/5">
          <div className="flex items-start gap-4 py-2.5 first:pt-0">
            <div className="w-44 shrink-0 text-black/50 dark:text-white/50 pt-0.5">Genre</div>
            <div className="flex-1 min-w-0">
              <GenreTagsField
                eventId={event.id}
                tags={event.genre_tags ?? []}
                suggestions={genreSuggestions}
              />
            </div>
          </div>
          <div className="flex items-start gap-4 py-2.5">
            <div className="w-44 shrink-0 text-black/50 dark:text-white/50 pt-0.5">
              Typical performance days
            </div>
            <div className="flex-1 min-w-0">
              <InlineEditField
                table="events"
                id={event.id}
                field="typical_performance_days"
                value={event.typical_performance_days}
                placeholder="Add typical days/times"
              />
            </div>
          </div>
          <div className="flex items-start gap-4 py-2.5 last:pb-0">
            <div className="w-44 shrink-0 text-black/50 dark:text-white/50 pt-0.5">
              Submission notes
            </div>
            <div className="flex-1 min-w-0">
              <InlineEditField
                table="events"
                id={event.id}
                field="submission_notes"
                value={event.submission_notes}
                placeholder="Add booking deadline / how to submit"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900 flex flex-col min-h-[140px]">
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
            placeholder="Add your own notes"
          />
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {outreachTouches.length > 0 && (
          <CollapsibleSection
            summary={`Outreach history · ${outreachTouches.length} pitch${outreachTouches.length === 1 ? "" : "es"} · last ${formatLogDate(outreachTouches[0].sentAt)}`}
          >
            {outreachTouches.map((touch) => (
              <div
                key={touch.sentAt}
                className="pt-3 first:pt-0 border-t border-black/5 dark:border-white/5 first:border-t-0"
              >
                <div className="text-xs text-black/40 dark:text-white/40 mb-0.5">
                  {formatLogDate(touch.sentAt)}
                  {touch.userDisplayName && ` · by ${touch.userDisplayName}`}
                </div>
                <div>
                  {touch.artistNames.length > 0 ? (
                    <>
                      Pitched to{" "}
                      <span className="font-medium text-black/90 dark:text-white/90">
                        {touch.artistNames.join(", ")}
                      </span>
                    </>
                  ) : (
                    "Marked as pitched (no specific artist recorded)."
                  )}
                </div>
              </div>
            ))}
          </CollapsibleSection>
        )}

        {event.research_log && event.research_log.trim() !== "" && (
          <CollapsibleSection summary="Research log">
            <div className="whitespace-pre-wrap">{event.research_log}</div>
          </CollapsibleSection>
        )}
      </div>

      <h2 className="text-lg font-medium mb-3">
        Plays {plays.length ? `(${plays.length})` : ""}
      </h2>
      <PlaysTable rows={plays} contextColumnLabel="Venue" />
    </div>
  );
}
