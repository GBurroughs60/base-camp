import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PlaysTable, { type PlaysTableRow } from "@/components/PlaysTable";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineSelectField from "@/components/inline/InlineSelectField";
import ArtistTeam, { type ArtistTeamMember } from "@/components/inline/ArtistTeam";
import RecordActionsMenu from "@/components/inline/RecordActionsMenu";
import type { ArtistTeamRole } from "@/app/actions/records";
import { websiteHref } from "@/lib/url";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const RIDGE_OPTIONS = [
  { value: "true", label: "The Ridge" },
  { value: "false", label: "External" },
];

export default async function ArtistDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: artist } = await supabase
    .from("artists")
    .select(
      "id, name, status, notes, website, ridge_manages, ridge_books, management_commission_pct, booking_agent_commission_pct, archived"
    )
    .eq("id", id)
    .maybeSingle();

  if (!artist) notFound();

  const { data: teamData } = await supabase
    .from("contact_artists")
    .select("id, role, contacts(id, full_name, company:companies(name))")
    .eq("artist_id", id)
    .order("created_at");

  type TeamRow = {
    id: string;
    role: ArtistTeamRole;
    contacts: { id: string; full_name: string; company: { name: string } | null } | null;
  };

  const membersByRole: Record<ArtistTeamRole, ArtistTeamMember[]> = {
    artist: [],
    manager: [],
    agent: [],
    tour_manager: [],
    publicist: [],
    other: [],
  };
  for (const row of (teamData ?? []) as unknown as TeamRow[]) {
    const c = row.contacts;
    if (!c) continue;
    membersByRole[row.role].push({
      rowId: row.id,
      contactId: c.id,
      label: c.full_name,
      companyName: c.company?.name ?? null,
    });
  }

  const { data: playsData } = await supabase
    .from("plays")
    .select(
      "id, show_date, guarantee_amount, deal_terms, contract_status, venue_name, venue:companies!plays_venue_id_fkey(id, name)"
    )
    .eq("artist_id", id)
    .order("show_date", { ascending: true });

  const plays: PlaysTableRow[] = (playsData ?? []).map((p) => {
    const venue = p.venue as unknown as { id: string; name: string } | null;
    return {
      id: p.id,
      show_date: p.show_date,
      // Already on this artist's own page -- no point linking to itself.
      artist_id: null,
      artist_name: artist.name,
      guarantee_amount: p.guarantee_amount,
      deal_terms: p.deal_terms,
      contract_status: p.contract_status,
      context_label: venue?.name ?? p.venue_name ?? "No venue on file",
      context_href: venue ? `/companies/${venue.id}` : null,
    };
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href="/artists"
          className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        >
          ← All artists
        </Link>
        <RecordActionsMenu
          table="artists"
          id={artist.id}
          name={artist.name}
          archived={artist.archived}
          archiveNote={
            plays.length > 0
              ? `all ${plays.length} of their plays stay exactly as they are`
              : undefined
          }
          hideDelete
        />
      </div>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-medium">
            <InlineEditField
              table="artists"
              id={artist.id}
              field="name"
              value={artist.name}
              placeholder="Add name"
            />
          </h1>
          {artist.archived && (
            <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full border border-black/15 dark:border-white/15 text-black/50 dark:text-white/50">
              Archived
            </span>
          )}
          <p className="text-black/60 dark:text-white/60 mt-1">
            <InlineEditField
              table="artists"
              id={artist.id}
              field="website"
              value={artist.website}
              placeholder="Add website"
              href={websiteHref(artist.website)}
            />
          </p>
        </div>
        <span className="text-xs px-2.5 py-1 rounded-full border border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06] capitalize">
          <InlineSelectField
            table="artists"
            id={artist.id}
            field="status"
            value={artist.status}
            options={STATUS_OPTIONS}
          />
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Relationship
          </h2>
          <div className="text-sm space-y-3">
            <div>
              <div className="text-xs text-black/50 dark:text-white/50 mb-0.5">
                Management
              </div>
              <InlineSelectField
                table="artists"
                id={artist.id}
                field="ridge_manages"
                value={artist.ridge_manages}
                options={RIDGE_OPTIONS}
              />
            </div>
            <div>
              <div className="text-xs text-black/50 dark:text-white/50 mb-0.5">
                Booking
              </div>
              <InlineSelectField
                table="artists"
                id={artist.id}
                field="ridge_books"
                value={artist.ridge_books}
                options={RIDGE_OPTIONS}
              />
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
            <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
              Standard Splits
            </div>
            <div className="text-sm space-y-1.5">
              <div>
                <span className="text-black/50 dark:text-white/50">Management: </span>
                <InlineEditField
                  table="artists"
                  id={artist.id}
                  field="management_commission_pct"
                  value={artist.management_commission_pct}
                  type="number"
                  format="percent"
                  placeholder="Add %"
                />
              </div>
              <div>
                <span className="text-black/50 dark:text-white/50">Booking: </span>
                <InlineEditField
                  table="artists"
                  id={artist.id}
                  field="booking_agent_commission_pct"
                  value={artist.booking_agent_commission_pct}
                  type="number"
                  format="percent"
                  placeholder="Add %"
                />
              </div>
            </div>
            <p className="text-xs text-black/40 dark:text-white/40 mt-2">
              Prefills new plays for this artist — each show can still be adjusted on its own.
            </p>
          </div>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Team
          </h2>
          <ArtistTeam
            artistId={artist.id}
            membersByRole={membersByRole}
            ridgeManages={artist.ridge_manages}
            ridgeBooks={artist.ridge_books}
          />
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8 bg-white dark:bg-neutral-900 flex flex-col min-h-[220px]">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
          Notes
        </h2>
        <div className="text-sm flex-1">
          <InlineEditField
            table="artists"
            id={artist.id}
            field="notes"
            value={artist.notes}
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
