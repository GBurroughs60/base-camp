import { createClient } from "@/lib/supabase/server";

export default async function ContactsPage() {
  const supabase = await createClient();
  const { data: contacts } = await supabase
    .from("contacts")
    .select("id, full_name, email, phone, title, companies(name)")
    .order("full_name");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Contacts</h1>
      <p className="text-black/60 dark:text-white/60 mb-6">
        {contacts?.length ?? 0} people
      </p>

      <div className="overflow-x-auto border border-black/10 dark:border-white/10 rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-black/[.03] dark:bg-white/[.06] text-left">
            <tr>
              <th className="px-4 py-2 font-medium">Name</th>
              <th className="px-4 py-2 font-medium">Company</th>
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Phone</th>
              <th className="px-4 py-2 font-medium">Title</th>
            </tr>
          </thead>
          <tbody>
            {contacts?.map((c) => (
              <tr
                key={c.id}
                className="border-t border-black/10 dark:border-white/10"
              >
                <td className="px-4 py-2">{c.full_name}</td>
                <td className="px-4 py-2">
                  {(c.companies as unknown as { name: string } | null)?.name ?? "—"}
                </td>
                <td className="px-4 py-2">{c.email ?? "—"}</td>
                <td className="px-4 py-2">{c.phone ?? "—"}</td>
                <td className="px-4 py-2">{c.title ?? "—"}</td>
              </tr>
            ))}
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
