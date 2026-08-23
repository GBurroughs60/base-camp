import { createClient } from "@/lib/supabase/server";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, type, city, state")
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Companies &amp; Venues</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {companies?.length ?? 0} records
      </p>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">State</th>
            </tr>
          </thead>
          <tbody>
            {companies?.map((c) => (
              <tr
                key={c.id}
                className="border-t border-black/10 dark:border-white/10"
              >
                <td className="px-4 py-2">{c.name}</td>
                <td className="px-4 py-2 capitalize">{c.type}</td>
                <td className="px-4 py-2">{c.city ?? "—"}</td>
                <td className="px-4 py-2">{c.state ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!companies?.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            No companies yet.
          </p>
        )}
      </div>
    </div>
  );
}
