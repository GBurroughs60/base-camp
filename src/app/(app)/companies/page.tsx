import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data: companies } = await supabase
    .from("companies")
    .select("id, name, type, city, state")
    .order("name");

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Venues</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {companies?.length ?? 0} records
      </p>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
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
                className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
              >
                <td className="px-4 py-2">
                  <Link
                    href={`/companies/${c.id}`}
                    className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                  >
                    {c.name}
                  </Link>
                </td>
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
