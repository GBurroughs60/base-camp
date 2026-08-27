import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContractUpload from "./ContractUpload";
import InlineEditField from "@/components/inline/InlineEditField";
import InlineLocationField from "@/components/inline/InlineLocationField";
import InlineRelationField from "@/components/inline/InlineRelationField";
import InlineSelectField from "@/components/inline/InlineSelectField";
import AdditionalContacts, {
  type LinkedContactItem,
} from "@/components/inline/AdditionalContacts";
import RecordActionsMenu from "@/components/inline/RecordActionsMenu";
import {
  type PlayStatus,
  PLAY_STATUS_OPTIONS,
  PLAY_STATUS_BADGE_CLASSES,
} from "@/lib/playStatus";

export default async function PlayDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: play } = await supabase
    .from("plays")
    .select(
      `id, show_date, set_type, status, attendance, tickets_sold, ticket_price, gross_revenue,
       gross_merch_sales, band_percentage, guarantee_amount, amount_due_to_agency,
       management_commission_pct, management_commission_amount,
       booking_agent_commission_pct, booking_agent_commission_amount,
       contract_status, contract_due_date, deposit_status, deposit_amount, deposit_due_date,
       final_payment_received, capacity, age_limit, deal_terms, bill_position,
       other_artists_on_bill, notes, details, venue_name, city, state,
       contract_file_path, contract_file_name, contract_uploaded_at,
       event_id, venue_id,
       artists(id, name),
       events(id, name, is_public),
       venue:companies!plays_venue_id_fkey(id, name, city, state, phone, website),
       primary_contact:contacts(id, full_name, email, phone)`
    )
    .eq("id", id)
    .maybeSingle();

  if (!play) notFound();

  const artist = play.artists as unknown as { id: string; name: string } | null;
  const event = play.events as unknown as
    | { id: string; name: string; is_public: boolean }
    | null;
  const venue = play.venue as unknown as
    | { id: string; name: string; city: string | null; state: string | null; phone: string | null; website: string | null }
    | null;
  const contact = play.primary_contact as unknown as
    | { id: string; full_name: string; email: string | null; phone: string | null }
    | null;
  const details = (play.details as Record<string, unknown> | null) ?? {};
  const detailEntries = Object.entries(details).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  const { data: linkedContactsData } = await supabase
    .from("contact_plays")
    .select("id, contacts(id, full_name)")
    .eq("play_id", id)
    .order("created_at");

  const linkedContacts: LinkedContactItem[] = (linkedContactsData ?? [])
    .map((row) => {
      const c = row.contacts as unknown as { id: string; full_name: string } | null;
      return c ? { rowId: row.id, contactId: c.id, label: c.full_name } : null;
    })
    .filter((v): v is LinkedContactItem => v !== null);

  const backHref = event ? `/events/${event.id}` : "/plays";
  const backLabel = event ? `← ${event.name}` : "← All plays";
  const playName = [artist?.name, venue?.name ?? play.venue_name, play.show_date]
    .filter(Boolean)
    .join(" — ") || "this play";

  return (
    <div>
      <div className="flex items-center justify-between">
        <Link
          href={backHref}
          className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
        >
          {backLabel}
        </Link>
        <RecordActionsMenu table="plays" id={play.id} name={playName} />
      </div>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-medium mb-1">
            {artist?.name ?? "Play"}
          </h1>
          <p className="text-black/60 dark:text-white/60 flex flex-wrap items-center gap-x-1">
            <InlineEditField
              table="plays"
              id={play.id}
              field="show_date"
              value={play.show_date}
              type="date"
              format="date"
              placeholder="Add date"
            />
            <span>·</span>
            <InlineEditField
              table="plays"
              id={play.id}
              field="set_type"
              value={play.set_type}
              placeholder="Add set type"
            />
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border whitespace-nowrap ${
            PLAY_STATUS_BADGE_CLASSES[play.status as PlayStatus]
          }`}
        >
          <InlineSelectField
            table="plays"
            id={play.id}
            field="status"
            value={play.status}
            options={PLAY_STATUS_OPTIONS}
          />
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Event
          </h2>
          <InlineRelationField
            table="plays"
            id={play.id}
            field="event_id"
            relatedTable="events"
            value={event ? { id: event.id, label: event.name } : null}
            placeholder="No event — this is a plain venue date"
            className="text-sm font-medium"
          />
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Venue
          </h2>
          <div className="text-sm space-y-1">
            <InlineRelationField
              table="plays"
              id={play.id}
              field="venue_id"
              relatedTable="companies"
              value={venue ? { id: venue.id, label: venue.name } : null}
              placeholder="No linked venue record"
              className="font-medium"
            />
            {venue ? (
              <div className="text-black/60 dark:text-white/60">
                {[venue.city, venue.state].filter(Boolean).join(", ") || "—"}
              </div>
            ) : (
              <div className="text-black/60 dark:text-white/60 flex flex-wrap items-center gap-x-1">
                <InlineEditField
                  table="plays"
                  id={play.id}
                  field="venue_name"
                  value={play.venue_name}
                  placeholder="Add venue name"
                />
                <span>·</span>
                <InlineLocationField
                  table="plays"
                  id={play.id}
                  city={play.city}
                  state={play.state}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Deal
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-black/50 dark:text-white/50">Guarantee</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="guarantee_amount" value={play.guarantee_amount} type="number" format="money" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Deal terms</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="deal_terms" value={play.deal_terms} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Billing</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="bill_position" value={play.bill_position} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Other artists on bill</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="other_artists_on_bill" value={play.other_artists_on_bill} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Capacity</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="capacity" value={play.capacity} type="number" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Age limit</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="age_limit" value={play.age_limit} placeholder="Add" />
            </dd>
          </dl>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Box Office
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-black/50 dark:text-white/50">Attendance</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="attendance" value={play.attendance} type="number" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Tickets sold</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="tickets_sold" value={play.tickets_sold} type="number" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Ticket price</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="ticket_price" value={play.ticket_price} type="number" format="money" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Gross revenue</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="gross_revenue" value={play.gross_revenue} type="number" format="money" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Gross merch sales</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="gross_merch_sales" value={play.gross_merch_sales} type="number" format="money" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Band %</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="band_percentage" value={play.band_percentage} type="number" format="percent" placeholder="Add" />
            </dd>
          </dl>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Contract &amp; Payment
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-black/50 dark:text-white/50">Contract status</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="contract_status" value={play.contract_status} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Contract due</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="contract_due_date" value={play.contract_due_date} type="date" format="date" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Deposit</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="deposit_amount" value={play.deposit_amount} type="number" format="money" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Deposit due</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="deposit_due_date" value={play.deposit_due_date} type="date" format="date" placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Deposit status</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="deposit_status" value={play.deposit_status} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Final payment</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="final_payment_received" value={play.final_payment_received} placeholder="Add" />
            </dd>
            <dt className="text-black/50 dark:text-white/50">Amount due to agency</dt>
            <dd>
              <InlineEditField table="plays" id={play.id} field="amount_due_to_agency" value={play.amount_due_to_agency} type="number" format="money" placeholder="Add" />
            </dd>
          </dl>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Contract File
          </h2>
          <ContractUpload
            playId={play.id}
            filePath={play.contract_file_path}
            fileName={play.contract_file_name}
            uploadedAt={play.contract_uploaded_at}
          />
        </div>
      </div>

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
          Contact
        </h2>
        <div className="text-sm space-y-1">
          <InlineRelationField
            table="plays"
            id={play.id}
            field="primary_contact_id"
            relatedTable="contacts"
            value={contact ? { id: contact.id, label: contact.full_name } : null}
            placeholder="No contact on file"
            className="font-medium"
            confirmSwitch
          />
          {contact && (
            <>
              {contact.email && (
                <div className="text-black/60 dark:text-white/60">{contact.email}</div>
              )}
              {contact.phone && (
                <div className="text-black/60 dark:text-white/60">{contact.phone}</div>
              )}
            </>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-black/10 dark:border-white/10">
          <div className="text-xs font-medium text-black/50 dark:text-white/50 mb-2 uppercase tracking-wide">
            Additional Contacts
          </div>
          <AdditionalContacts
            kind="play"
            targetId={play.id}
            items={linkedContacts}
            bordered={false}
          />
        </div>
      </div>

      {detailEntries.length > 0 && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Show Details
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-black/50 dark:text-white/50 capitalize">
                  {/* Historical import field names from the raw spreadsheet use
                      "B2S" (the old B2S Group name) -- shown as "Management"
                      going forward without touching the stored data. */}
                  {k.replace(/_/g, " ").replace(/B2S/g, "Management")}
                </dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900 flex flex-col min-h-[220px]">
        <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
          Notes
        </h2>
        <div className="text-sm flex-1">
          <InlineEditField table="plays" id={play.id} field="notes" value={play.notes} type="textarea" placeholder="Add notes" />
        </div>
      </div>
    </div>
  );
}
