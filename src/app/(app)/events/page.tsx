import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  name: string;
  is_public: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  companies: { id: string; name: string } | null;
  contacts: { id: string; full_name: string } | null;
  plays: { id: string }[] | null;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string }>;
}) {
  const { visibility } = await searchParams;
  const supabase = await createClient();

  const activeFilter = visibility ?? "public";

  let query = supabase
    .from("events")
    .select(
      "id, name, is_public, city, state, country, companies(id, name), contacts(id, full_name), plays(id)"
    )
    .order("name");

  if (activeFilter === "public") query = query.eq("is_public", true);
  if (activeFilter === "private") query = query.eq("is_public", false);

  const { data } = await query;
  const events = data as unknown as EventRow[] | null;

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Events</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {events?.length ?? 0} events
      </p>

      <div className="flex gap-2 mb-6 text-sm">
        {[
          { key: "public", label: "Public" },
          { key: "private", label: "Private" },
          { key: "all", label: "All" },
        ].map((f) => (
          <a
            key={f.key}
            href={`/events?visibility=${f.key}`}
            className={`px-3 py-1 rounded-full border transition-colors ${
              activeFilter === f.key
                ? "bg-ridge-orange text-white border-transparent"
                : "border-black/15 dark:border-white/15 hover:border-ridge-orange/50"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Venue</th>
              <th className="px-4 py-2 font-medium">Location</th>
              <th className="px-4 py-2 font-medium">Contact</th>
              <th className="px-4 py-2 font-medium">Visibility</th>
              <th className="px-4 py-2 font-medium">Plays</th>
            </tr>
          </thead>
          <tbody>
            {events?.map((e) => (
              <tr
                key={e.id}
                className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/events/${e.id}`}
                    className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {e.name}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {e.companies ? (
                    <Link
                      href={`/companies/${e.companies.id}`}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {e.companies.name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {[e.city, e.state, e.country !== "USA" ? e.country : null]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2">
                  {e.contacts ? (
                    <Link
                      href={`/contacts/${e.contacts.id}`}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {e.contacts.full_name}
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-4 py-2">
                  {e.is_public ? "Public" : "Private"}
                </td>
                <td className="px-4 py-2">{e.plays?.length ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!events?.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            No events yet.
          </p>
        )}
      </div>
    </div>
  );
}
