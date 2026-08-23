import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatMoney(n: number | null) {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

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

  const { data: plays } = await supabase
    .from("plays")
    .select(
      "id, show_date, artists(name), attendance, tickets_sold, gross_revenue, contract_status, ticket_price"
    )
    .eq("event_id", id)
    .order("show_date", { ascending: true });

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
          <h1 className="text-2xl font-semibold mb-1">{event.name}</h1>
          <p className="text-black/60 dark:text-white/60">
            {[event.city, event.state, event.country !== "USA" ? event.country : null]
              .filter(Boolean)
              .join(", ") || "No location on file"}
          </p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            event.is_public
              ? "border-black/15 dark:border-white/15"
              : "border-black/15 dark:border-white/15 bg-black/[.03] dark:bg-white/[.06]"
          }`}
        >
          {event.is_public ? "Public" : "Private"}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5">
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

        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5">
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
        <div className="border border-black/10 dark:border-white/10 rounded-lg p-5 mb-8">
          <h2 className="text-sm font-medium text-black/60 dark:text-white/60 mb-2">
            Notes
          </h2>
          <p className="text-sm whitespace-pre-wrap">{event.notes}</p>
        </div>
      )}

      <h2 className="text-lg font-medium mb-3">
        Plays {plays?.length ? `(${plays.length})` : ""}
      </h2>
      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Artist</th>
              <th className="px-4 py-2 font-medium">Attendance</th>
              <th className="px-4 py-2 font-medium">Ticket Price</th>
              <th className="px-4 py-2 font-medium">Gross Revenue</th>
              <th className="px-4 py-2 font-medium">Contract</th>
            </tr>
          </thead>
          <tbody>
            {plays?.map((p) => (
              <tr
                key={p.id}
                className="border-t border-black/10 dark:border-white/10"
              >
                <td className="px-4 py-2 whitespace-nowrap">
                  {p.show_date ?? "—"}
                </td>
                <td className="px-4 py-2">
                  {(p.artists as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">{p.attendance ?? "—"}</td>
                <td className="px-4 py-2">{formatMoney(p.ticket_price)}</td>
                <td className="px-4 py-2">{formatMoney(p.gross_revenue)}</td>
                <td className="px-4 py-2">{p.contract_status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!plays?.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            No plays linked to this event.
          </p>
        )}
      </div>
    </div>
  );
}
