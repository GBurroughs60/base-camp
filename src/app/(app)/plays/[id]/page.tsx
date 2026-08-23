import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ContractUpload from "./ContractUpload";

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(`${d}T00:00:00`).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

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
      `id, show_date, set_type, attendance, tickets_sold, ticket_price, gross_revenue,
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

  const backHref = event ? `/events/${event.id}` : "/plays";
  const backLabel = event ? `← ${event.name}` : "← All plays";

  return (
    <div>
      <Link
        href={backHref}
        className="text-sm text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
      >
        {backLabel}
      </Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="font-display text-3xl font-medium mb-1">
            {artist?.name ?? "Play"}
          </h1>
          <p className="text-black/60 dark:text-white/60">
            {formatDate(play.show_date)}
            {play.set_type ? ` · ${play.set_type}` : ""}
          </p>
        </div>
        {play.contract_status && (
          <span className="text-xs px-2.5 py-1 rounded-full border border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06] whitespace-nowrap">
            {play.contract_status}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Event
          </h2>
          {event ? (
            <Link
              href={`/events/${event.id}`}
              className="text-sm font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
            >
              {event.name}
            </Link>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              No event — this is a plain venue date.
            </p>
          )}
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Venue
          </h2>
          {venue ? (
            <div className="text-sm space-y-1">
              <Link
                href={`/companies/${venue.id}`}
                className="font-medium text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
              >
                {venue.name}
              </Link>
              <div className="text-black/60 dark:text-white/60">
                {[venue.city, venue.state].filter(Boolean).join(", ") || "—"}
              </div>
            </div>
          ) : (
            <p className="text-sm text-black/60 dark:text-white/60">
              {play.venue_name || [play.city, play.state].filter(Boolean).join(", ") || "No venue on file."}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Deal
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-black/50 dark:text-white/50">Guarantee</dt>
            <dd>{formatMoney(play.guarantee_amount)}</dd>
            <dt className="text-black/50 dark:text-white/50">Deal terms</dt>
            <dd>{play.deal_terms ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Billing</dt>
            <dd>{play.bill_position ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Other artists on bill</dt>
            <dd>{play.other_artists_on_bill ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Capacity</dt>
            <dd>{play.capacity ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Age limit</dt>
            <dd>{play.age_limit ?? "—"}</dd>
          </dl>
        </div>

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Box Office
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            <dt className="text-black/50 dark:text-white/50">Attendance</dt>
            <dd>{play.attendance ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Tickets sold</dt>
            <dd>{play.tickets_sold ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Ticket price</dt>
            <dd>{formatMoney(play.ticket_price)}</dd>
            <dt className="text-black/50 dark:text-white/50">Gross revenue</dt>
            <dd>{formatMoney(play.gross_revenue)}</dd>
            <dt className="text-black/50 dark:text-white/50">Gross merch sales</dt>
            <dd>{formatMoney(play.gross_merch_sales)}</dd>
            <dt className="text-black/50 dark:text-white/50">Band %</dt>
            <dd>{play.band_percentage !== null ? `${play.band_percentage}%` : "—"}</dd>
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
            <dd>{play.contract_status ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Contract due</dt>
            <dd>{formatDate(play.contract_due_date)}</dd>
            <dt className="text-black/50 dark:text-white/50">Deposit</dt>
            <dd>{formatMoney(play.deposit_amount)}</dd>
            <dt className="text-black/50 dark:text-white/50">Deposit due</dt>
            <dd>{formatDate(play.deposit_due_date)}</dd>
            <dt className="text-black/50 dark:text-white/50">Deposit status</dt>
            <dd>{play.deposit_status ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Final payment</dt>
            <dd>{play.final_payment_received ?? "—"}</dd>
            <dt className="text-black/50 dark:text-white/50">Amount due to agency</dt>
            <dd>{formatMoney(play.amount_due_to_agency)}</dd>
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

      {contact && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Primary Contact
          </h2>
          <div className="text-sm space-y-1">
            <div className="font-medium">{contact.full_name}</div>
            {contact.email && (
              <div className="text-black/60 dark:text-white/60">{contact.email}</div>
            )}
            {contact.phone && (
              <div className="text-black/60 dark:text-white/60">{contact.phone}</div>
            )}
          </div>
        </div>
      )}

      {detailEntries.length > 0 && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-4 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-3">
            Show Details
          </h2>
          <dl className="text-sm grid grid-cols-2 gap-y-2">
            {detailEntries.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-black/50 dark:text-white/50 capitalize">
                  {k.replace(/_/g, " ")}
                </dt>
                <dd>{String(v)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {play.notes && (
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 bg-white dark:bg-neutral-900">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">{play.notes}</p>
        </div>
      )}
    </div>
  );
}
