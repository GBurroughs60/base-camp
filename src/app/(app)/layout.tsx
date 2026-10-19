import Nav from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [
    { count: actionItemCount },
    { count: artistCount },
    { count: contactCount },
    { count: companyCount },
    { count: eventCount },
    { count: playCount },
    { count: candidateCount },
  ] = await Promise.all([
    // Same visibility rule as the Action List page itself: open, and
    // either never hidden or past its hidden_until. superseded/completed
    // rows never count, same as archived rows elsewhere.
    supabase
      .from("action_items")
      .select("*", { count: "exact", head: true })
      .eq("status", "open")
      .or(`hidden_until.is.null,hidden_until.lte.${today}`),
    supabase
      .from("artists")
      .select("*", { count: "exact", head: true })
      .eq("archived", false),
    supabase.from("contacts").select("*", { count: "exact", head: true }),
    supabase
      .from("companies")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .eq("pending_state_review", false),
    supabase
      .from("events")
      .select("*", { count: "exact", head: true })
      .eq("archived", false)
      .eq("pending_state_review", false),
    supabase.from("plays").select("*", { count: "exact", head: true }),
    // Same "new" definition as the candidates page itself -- imported/
    // dismissed rows (and nothing else) drop out of this count.
    supabase
      .from("candidates")
      .select("*", { count: "exact", head: true })
      .or("status.is.null,status.eq.new"),
  ]);

  const counts = {
    "/action-items": actionItemCount ?? 0,
    "/artists": artistCount ?? 0,
    "/contacts": contactCount ?? 0,
    "/companies": companyCount ?? 0,
    "/events": eventCount ?? 0,
    "/plays": playCount ?? 0,
    "/candidates": candidateCount ?? 0,
  };

  return (
    <div className="flex-1 flex min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <Nav counts={counts} />
      <div className="flex-1 min-w-0">
        {/* Extra top padding on mobile only, clearing the fixed nav
            expand tab (Nav.tsx) that sits on the viewport's left edge
            below md -- md:pt-8 restores the original spacing once the
            sidebar is always visible and the tab no longer renders. */}
        <main className="max-w-6xl w-full mx-auto px-6 pt-16 pb-8 sm:px-8 md:pt-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
