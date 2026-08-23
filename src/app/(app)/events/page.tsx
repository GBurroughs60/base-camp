import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type EventRow = {
  id: string;
  name: string;
  is_public: boolean;
  city: string | null;
  state: string | null;
  country: string | null;
  companies: { name: string } | null;
  contacts: { full_name: string } | null;
  plays: { id: string }[] | null;
};

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ visibility?: string }>;
}) {
  const { visibility } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("events")
    .select(
      "id, name, is_public, city, state, country, companies(name), contacts(full_name), plays(id)"
    )
    .order("name");

  if (visibility === "public") query = query.eq("is_public", true);
  if (visibility === "private") query = query.eq("is_public", false);

  const { data } = await query;
  const events = data as unknown as EventRow[] | null;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Events</h1>
      <p className="text-black/60 dark:text-white/60 mb-4">
        {events?.length ?? 0} events
      </p>

      <div className="flex gap-2 mb-6 text-sm">
        {[
          { key: undefined, label: "All" },
          { key: "public", label: "Public" },
          { key: "private", label: "Private" },
        ].map((f) => (
          <a
            key={f.label}
            href={f.key ? `/events?visibility=${f.key}` : "/events"}
            className={`px-3 py-1 rounded-full border ${
              visibility === f.key ||
              (!visibility && f.key === undefined)
                ? "bg-black text-white dark:bg-white dark:text-black border-transparent"
                : "border-black/15 dark:border-white/15"
            }`}
          >
            {f.label}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg">
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
                className="border-t border-black/10 dark:border-white/10"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/events/${e.id}`}
                    className="underline underline-offset-4 hover:no-underline"
                  >
                    {e.name}
                  </Link>
                </td>
                <td className="px-4 py-2">{e.companies?.name ?? "—"}</td>
                <td className="px-4 py-2">
                  {[e.city, e.state, e.country !== "USA" ? e.country : null]
                    .filter(Boolean)
                    .join(", ") || "—"}
                </td>
                <td className="px-4 py-2">{e.contacts?.full_name ?? "—"}</td>
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
