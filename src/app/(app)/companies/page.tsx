import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import NewRecordButton from "@/components/inline/NewRecordButton";

type CompanyRow = {
  id: string;
  name: string;
  type: string;
  city: string | null;
  state: string | null;
  contacts: { id: string; full_name: string }[] | null;
};

export default async function CompaniesPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, type, city, state, contacts(id, full_name)")
    .order("name");
  const companies = data as unknown as CompanyRow[] | null;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="font-display text-3xl font-medium mb-1">Venues</h1>
        <NewRecordButton />
      </div>
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
              <th className="px-4 py-2 font-medium">Contacts</th>
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
                <td className="px-4 py-2">
                  {c.contacts?.length ? (
                    <span className="space-x-1">
                      {c.contacts.map((contact, i) => (
                        <span key={contact.id}>
                          <Link
                            href={`/contacts/${contact.id}`}
                            className="text-ridge-orange-dark dark:text-ridge-orange hover:underline underline-offset-4"
                          >
                            {contact.full_name}
                          </Link>
                          {i < c.contacts!.length - 1 ? "," : ""}
                        </span>
                      ))}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
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
