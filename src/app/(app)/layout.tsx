import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const [
    { count: artistCount },
    { count: contactCount },
    { count: companyCount },
    { count: eventCount },
    { count: playCount },
  ] = await Promise.all([
    supabase.from("artists").select("*", { count: "exact", head: true }),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase.from("companies").select("*", { count: "exact", head: true }),
    supabase.from("events").select("*", { count: "exact", head: true }),
    supabase.from("plays").select("*", { count: "exact", head: true }),
  ]);

  const counts = {
    "/artists": artistCount ?? 0,
    "/contacts": contactCount ?? 0,
    "/companies": companyCount ?? 0,
    "/events": eventCount ?? 0,
    "/plays": playCount ?? 0,
  };

  return (
    <div className="flex-1 flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Nav counts={counts} />
      <div className="flex-1 min-w-0">
        <main className="max-w-6xl w-full mx-auto px-6 py-8 sm:px-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
