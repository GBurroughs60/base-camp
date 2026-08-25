import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, companies(id, name, city, state)")
    .order("full_name");

  return (
    <div>
      <h1 className="font-display text-3xl font-medium mb-1">Contacts</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {contacts?.length ?? 0} people
      </p>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg bg-white dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">City</th>
              <th className="px-4 py-2 font-medium">State</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Title</th>
            </tr>
          </thead>
          <tbody>
            {contacts?.map((c) => {
              const company = c.companies as unknown as {
                id: string;
                name: string;
                city: string | null;
                state: string | null;
              } | null;
              return (
                <tr
                  key={c.id}
                  className="border-t border-black/10 dark:border-white/10 hover:bg-black/[.02] dark:hover:bg-white/[.03] transition-colors"
                >
                  <td className="px-4 py-2">
                    <Link
                      href={`/contacts/${c.id}`}
                      className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                    >
                      {c.full_name}
                    </Link>
                  </td>
                  <td className="px-4 py-2">
                    {company ? (
                      <Link
                        href={`/companies/${company.id}`}
                        className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                      >
                        {company.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2">{company?.city ?? "—"}</td>
                  <td className="px-4 py-2">{company?.state ?? "—"}</td>
                  <td className="px-4 py-2">{c.email ?? "—"}</td>
                  <td className="px-4 py-2">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2">{c.title ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!contacts?.length && (
          <p className="p-6 text-sm text-black/60 dark:text-white/60">
            No contacts yet.
          </p>
        )}
      </div>
    </div>
  );
}
